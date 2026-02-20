const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { generateInviteCode } = require('../lib/invites');

const router = express.Router();

// POST /api/invites — generate a new invite code (admin only)
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const code = generateInviteCode();
    const { rows } = await db.query(
      'INSERT INTO invite_codes (code, created_by) VALUES ($1, $2) RETURNING *',
      [code, req.user.id]
    );
    res.status(201).json({ code: rows[0].code, id: rows[0].id });
  } catch (err) {
    console.error('Create invite error:', err);
    res.status(500).json({ error: 'Failed to generate invite code' });
  }
});

// GET /api/invites — list all invite codes (admin only)
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT
        ic.id,
        ic.code,
        ic.created_at,
        ic.used_at,
        creator.display_name AS created_by_name,
        used_user.display_name AS used_by_name,
        used_user.email AS used_by_email
      FROM invite_codes ic
      LEFT JOIN users creator ON creator.id = ic.created_by
      LEFT JOIN users used_user ON used_user.id = ic.used_by
      ORDER BY ic.created_at DESC
    `);
    res.json({ invites: rows });
  } catch (err) {
    console.error('List invites error:', err);
    res.status(500).json({ error: 'Failed to fetch invite codes' });
  }
});

module.exports = router;
