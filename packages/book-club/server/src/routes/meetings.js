const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// Router for /api/rounds/:id/meetings
const roundMeetingsRouter = express.Router({ mergeParams: true });

// GET /api/rounds/:id/meetings
roundMeetingsRouter.get('/', requireAuth, async (req, res) => {
  const { id: roundId } = req.params;
  try {
    const { rows } = await db.query(
      `SELECT
        m.*,
        u.display_name AS proposed_by_name,
        COUNT(CASE WHEN a.response = 'yes' THEN 1 END) AS yes_count,
        COUNT(CASE WHEN a.response = 'maybe' THEN 1 END) AS maybe_count,
        COUNT(CASE WHEN a.response = 'no' THEN 1 END) AS no_count,
        (
          SELECT a2.response
          FROM availability a2
          WHERE a2.meeting_id = m.id AND a2.user_id = $2
          LIMIT 1
        ) AS my_response
       FROM meetings m
       JOIN users u ON u.id = m.proposed_by
       LEFT JOIN availability a ON a.meeting_id = m.id
       WHERE m.round_id = $1
       GROUP BY m.id, u.display_name
       ORDER BY m.proposed_datetime ASC`,
      [roundId, req.user.id]
    );
    res.json({ meetings: rows });
  } catch (err) {
    console.error('List meetings error:', err);
    res.status(500).json({ error: 'Failed to fetch meetings' });
  }
});

// POST /api/rounds/:id/meetings
roundMeetingsRouter.post('/', requireAuth, [
  body('proposed_datetime').isISO8601().withMessage('proposed_datetime must be a valid date'),
  body('location').optional().trim(),
  body('virtual_link').optional().trim(),
  body('notes').optional().trim(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { id: roundId } = req.params;
  const { proposed_datetime, location, virtual_link, notes } = req.body;

  try {
    const { rows: roundRows } = await db.query(
      'SELECT id FROM rounds WHERE id = $1',
      [roundId]
    );
    if (roundRows.length === 0) {
      return res.status(404).json({ error: 'Round not found' });
    }

    const { rows } = await db.query(
      `INSERT INTO meetings (round_id, proposed_by, proposed_datetime, location, virtual_link, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [roundId, req.user.id, proposed_datetime, location || null, virtual_link || null, notes || null]
    );

    res.status(201).json({ meeting: rows[0] });
  } catch (err) {
    console.error('Create meeting error:', err);
    res.status(500).json({ error: 'Failed to create meeting' });
  }
});

// Router for /api/meetings/:id (single meeting operations)
const meetingRouter = express.Router();

// POST /api/meetings/:id/availability
meetingRouter.post('/:id/availability', requireAuth, [
  body('response').isIn(['yes', 'maybe', 'no']).withMessage('response must be yes, maybe, or no'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { id: meetingId } = req.params;
  const { response } = req.body;

  try {
    const { rows: meetingRows } = await db.query(
      'SELECT id FROM meetings WHERE id = $1',
      [meetingId]
    );
    if (meetingRows.length === 0) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    const { rows } = await db.query(
      `INSERT INTO availability (meeting_id, user_id, response)
       VALUES ($1, $2, $3)
       ON CONFLICT (meeting_id, user_id) DO UPDATE SET response = EXCLUDED.response
       RETURNING *`,
      [meetingId, req.user.id, response]
    );

    res.json({ availability: rows[0] });
  } catch (err) {
    console.error('Submit availability error:', err);
    res.status(500).json({ error: 'Failed to submit availability' });
  }
});

// PATCH /api/meetings/:id/confirm
meetingRouter.patch('/:id/confirm', requireAuth, requireAdmin, async (req, res) => {
  const { id: meetingId } = req.params;

  try {
    const { rows: meetingRows } = await db.query(
      'SELECT * FROM meetings WHERE id = $1',
      [meetingId]
    );
    if (meetingRows.length === 0) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    const { rows } = await db.query(
      `UPDATE meetings SET status = 'confirmed' WHERE id = $1 RETURNING *`,
      [meetingId]
    );

    // Log notification for all members
    const { rows: members } = await db.query(
      'SELECT id, contact_channel FROM users'
    );

    const meeting = rows[0];
    for (const member of members) {
      await db.query(
        `INSERT INTO notifications (user_id, channel, subject, body)
         VALUES ($1, $2, $3, $4)`,
        [
          member.id,
          member.contact_channel || 'email',
          'Meeting Confirmed',
          `A meeting has been confirmed for ${new Date(meeting.proposed_datetime).toLocaleString()}${meeting.location ? ` at ${meeting.location}` : ''}${meeting.virtual_link ? `. Join: ${meeting.virtual_link}` : ''}.`,
        ]
      );
    }

    res.json({ meeting: rows[0] });
  } catch (err) {
    console.error('Confirm meeting error:', err);
    res.status(500).json({ error: 'Failed to confirm meeting' });
  }
});

// DELETE /api/meetings/:id
meetingRouter.delete('/:id', requireAuth, async (req, res) => {
  const { id: meetingId } = req.params;

  try {
    const { rows: meetingRows } = await db.query(
      'SELECT * FROM meetings WHERE id = $1',
      [meetingId]
    );
    if (meetingRows.length === 0) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    const meeting = meetingRows[0];

    if (meeting.status === 'confirmed') {
      return res.status(400).json({ error: 'Cannot delete a confirmed meeting' });
    }

    if (req.user.role !== 'admin' && meeting.proposed_by !== req.user.id) {
      return res.status(403).json({ error: 'You can only delete your own meeting proposals' });
    }

    await db.query('DELETE FROM meetings WHERE id = $1', [meetingId]);
    res.json({ message: 'Meeting deleted' });
  } catch (err) {
    console.error('Delete meeting error:', err);
    res.status(500).json({ error: 'Failed to delete meeting' });
  }
});

module.exports = { roundMeetingsRouter, meetingRouter };
