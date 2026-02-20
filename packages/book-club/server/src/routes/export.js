const express = require('express');
const { query, validationResult } = require('express-validator');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/export/full — full JSON dump (admin only)
router.get('/full', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows: users } = await db.query(
      'SELECT id, email, display_name, role, contact_channel, contact_address, notification_prefs, created_at, updated_at FROM users ORDER BY created_at'
    );

    const { rows: rounds } = await db.query(
      'SELECT * FROM rounds ORDER BY created_at'
    );

    const { rows: proposals } = await db.query(
      'SELECT * FROM proposals ORDER BY created_at'
    );

    const { rows: votes } = await db.query(
      'SELECT * FROM votes ORDER BY created_at'
    );

    const { rows: meetings } = await db.query(
      'SELECT * FROM meetings ORDER BY created_at'
    );

    const { rows: availability } = await db.query(
      'SELECT * FROM availability ORDER BY created_at'
    );

    const { rows: inviteCodes } = await db.query(
      'SELECT * FROM invite_codes ORDER BY created_at'
    );

    const { rows: notifications } = await db.query(
      'SELECT * FROM notifications ORDER BY created_at'
    );

    // Build nested structure: rounds → proposals → votes, meetings → availability
    const proposalsByRound = {};
    const meetingsByRound = {};

    for (const p of proposals) {
      if (!proposalsByRound[p.round_id]) proposalsByRound[p.round_id] = [];
      proposalsByRound[p.round_id].push({
        ...p,
        votes: votes.filter(v => v.proposal_id === p.id),
      });
    }

    for (const m of meetings) {
      if (!meetingsByRound[m.round_id]) meetingsByRound[m.round_id] = [];
      meetingsByRound[m.round_id].push({
        ...m,
        availability: availability.filter(a => a.meeting_id === m.id),
      });
    }

    const nestedRounds = rounds.map(r => ({
      ...r,
      proposals: proposalsByRound[r.id] || [],
      meetings: meetingsByRound[r.id] || [],
    }));

    res.json({
      exported_at: new Date().toISOString(),
      users,
      rounds: nestedRounds,
      invite_codes: inviteCodes,
      notifications,
    });
  } catch (err) {
    console.error('Export full error:', err);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

// GET /api/export/since?ts=<ISO8601> — delta export (admin only)
router.get('/since', requireAuth, requireAdmin, [
  query('ts').isISO8601().withMessage('ts must be a valid ISO8601 timestamp'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { ts } = req.query;

  try {
    const { rows: users } = await db.query(
      `SELECT id, email, display_name, role, contact_channel, contact_address, notification_prefs, created_at, updated_at
       FROM users WHERE created_at > $1 OR updated_at > $1`,
      [ts]
    );

    const { rows: rounds } = await db.query(
      'SELECT * FROM rounds WHERE created_at > $1 OR updated_at > $1',
      [ts]
    );

    const { rows: proposals } = await db.query(
      'SELECT * FROM proposals WHERE created_at > $1 OR updated_at > $1',
      [ts]
    );

    const { rows: votes } = await db.query(
      'SELECT * FROM votes WHERE created_at > $1',
      [ts]
    );

    const { rows: meetings } = await db.query(
      'SELECT * FROM meetings WHERE created_at > $1 OR updated_at > $1',
      [ts]
    );

    const { rows: availability } = await db.query(
      'SELECT * FROM availability WHERE created_at > $1 OR updated_at > $1',
      [ts]
    );

    const { rows: notifications } = await db.query(
      'SELECT * FROM notifications WHERE created_at > $1',
      [ts]
    );

    res.json({
      exported_at: new Date().toISOString(),
      since: ts,
      users,
      rounds,
      proposals,
      votes,
      meetings,
      availability,
      notifications,
    });
  } catch (err) {
    console.error('Export since error:', err);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

module.exports = router;
