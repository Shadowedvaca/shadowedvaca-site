const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function signToken(userId) {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

// POST /api/auth/register
router.post('/register', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('display_name').trim().isLength({ min: 1, max: 100 }).withMessage('Display name is required'),
  body('invite_code').trim().notEmpty().withMessage('Invite code is required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password, display_name, invite_code } = req.body;

  try {
    // Validate invite code
    const { rows: codeRows } = await db.query(
      'SELECT id, used_by FROM invite_codes WHERE code = $1',
      [invite_code.trim().toUpperCase()]
    );

    if (codeRows.length === 0) {
      return res.status(400).json({ error: 'Invalid invite code' });
    }

    if (codeRows[0].used_by) {
      return res.status(400).json({ error: 'Invite code has already been used' });
    }

    const inviteId = codeRows[0].id;

    // Check if email already taken
    const { rows: existingUser } = await db.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );
    if (existingUser.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // First user becomes admin
    const { rows: countRows } = await db.query('SELECT COUNT(*) FROM users');
    const isFirstUser = parseInt(countRows[0].count) === 0;
    const role = isFirstUser ? 'admin' : 'member';

    const password_hash = await bcrypt.hash(password, 12);

    const { rows: newUser } = await db.query(
      `INSERT INTO users (email, display_name, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, display_name, role, contact_channel, contact_address, notification_prefs, created_at`,
      [email, display_name.trim(), password_hash, role]
    );

    const user = newUser[0];

    // Mark invite code as used
    await db.query(
      'UPDATE invite_codes SET used_by = $1, used_at = NOW() WHERE id = $2',
      [user.id, inviteId]
    );

    const token = signToken(user.id);
    res.status(201).json({ token, user });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/auth/login
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password } = req.body;

  try {
    const { rows } = await db.query(
      'SELECT id, email, display_name, password_hash, role, contact_channel, contact_address, notification_prefs, created_at FROM users WHERE email = $1',
      [email]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const { password_hash, ...userWithoutHash } = user;
    const token = signToken(user.id);
    res.json({ token, user: userWithoutHash });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// PATCH /api/auth/me
router.patch('/me', requireAuth, [
  body('display_name').optional().trim().isLength({ min: 1, max: 100 }),
  body('contact_channel').optional().isIn(['email', 'sms', 'discord', 'slack']),
  body('contact_address').optional().trim(),
  body('notification_prefs').optional().isObject(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { display_name, contact_channel, contact_address, notification_prefs } = req.body;
  const updates = [];
  const values = [];
  let idx = 1;

  if (display_name !== undefined) {
    updates.push(`display_name = $${idx++}`);
    values.push(display_name);
  }
  if (contact_channel !== undefined) {
    updates.push(`contact_channel = $${idx++}`);
    values.push(contact_channel);
  }
  if (contact_address !== undefined) {
    updates.push(`contact_address = $${idx++}`);
    values.push(contact_address);
  }
  if (notification_prefs !== undefined) {
    updates.push(`notification_prefs = $${idx++}`);
    values.push(JSON.stringify(notification_prefs));
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  values.push(req.user.id);
  try {
    const { rows } = await db.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx}
       RETURNING id, email, display_name, role, contact_channel, contact_address, notification_prefs, created_at, updated_at`,
      values
    );
    res.json({ user: rows[0] });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

module.exports = router;
