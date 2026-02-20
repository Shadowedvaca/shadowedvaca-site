const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/admin/members — list all members (admin only)
router.get('/members', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, email, display_name, role, contact_channel, contact_address, created_at
       FROM users
       ORDER BY created_at ASC`
    );
    res.json({ members: rows });
  } catch (err) {
    console.error('List members error:', err);
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

module.exports = router;
