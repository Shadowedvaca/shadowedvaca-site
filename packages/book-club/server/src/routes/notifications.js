const express = require('express');
const { body, query, validationResult } = require('express-validator');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/notifications — current user's notifications (paginated)
router.get('/', requireAuth, [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
], async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;

  try {
    const { rows } = await db.query(
      `SELECT * FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]
    );

    const { rows: countRows } = await db.query(
      'SELECT COUNT(*) FROM notifications WHERE user_id = $1',
      [req.user.id]
    );

    res.json({
      notifications: rows,
      total: parseInt(countRows[0].count),
      page,
      limit,
    });
  } catch (err) {
    console.error('List notifications error:', err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// POST /api/notifications/send — send ad-hoc message to all members (admin only)
router.post('/send', requireAuth, requireAdmin, [
  body('subject').optional().trim(),
  body('body').trim().notEmpty().withMessage('Message body is required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { subject, body: messageBody } = req.body;

  try {
    const { rows: members } = await db.query('SELECT id, contact_channel FROM users');

    for (const member of members) {
      await db.query(
        `INSERT INTO notifications (user_id, channel, subject, body)
         VALUES ($1, $2, $3, $4)`,
        [member.id, member.contact_channel || 'email', subject || null, messageBody]
      );
    }

    res.json({ message: `Notification logged for ${members.length} members` });
  } catch (err) {
    console.error('Send notification error:', err);
    res.status(500).json({ error: 'Failed to send notification' });
  }
});

module.exports = router;
