const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { recomputeScores, determineWinner } = require('../lib/scoring');

const router = express.Router();

// GET /api/rounds — list all rounds
router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT
        r.id, r.title, r.status, r.voting_method, r.deadline,
        r.created_at, r.updated_at,
        r.winning_proposal_id,
        u.display_name AS created_by_name,
        COUNT(DISTINCT p.id) AS proposal_count,
        wp.title AS winning_title,
        wp.author AS winning_author
      FROM rounds r
      JOIN users u ON u.id = r.created_by
      LEFT JOIN proposals p ON p.round_id = r.id
      LEFT JOIN proposals wp ON wp.id = r.winning_proposal_id
      GROUP BY r.id, u.display_name, wp.title, wp.author
      ORDER BY r.created_at DESC
    `);
    res.json({ rounds: rows });
  } catch (err) {
    console.error('List rounds error:', err);
    res.status(500).json({ error: 'Failed to fetch rounds' });
  }
});

// POST /api/rounds — create a new round (admin only)
router.post('/', requireAuth, requireAdmin, [
  body('title').trim().isLength({ min: 1, max: 255 }).withMessage('Title is required'),
  body('voting_method').isIn(['ranked_choice', 'approval']).withMessage('voting_method must be ranked_choice or approval'),
  body('deadline').optional({ nullable: true }).isISO8601().withMessage('deadline must be a valid date'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { title, voting_method, deadline } = req.body;

  try {
    const { rows } = await db.query(
      `INSERT INTO rounds (title, voting_method, deadline, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [title.trim(), voting_method, deadline || null, req.user.id]
    );
    res.status(201).json({ round: rows[0] });
  } catch (err) {
    console.error('Create round error:', err);
    res.status(500).json({ error: 'Failed to create round' });
  }
});

// GET /api/rounds/:id — round detail with proposals and vote scores
router.get('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const { rows: roundRows } = await db.query(
      `SELECT r.*, u.display_name AS created_by_name
       FROM rounds r
       JOIN users u ON u.id = r.created_by
       WHERE r.id = $1`,
      [id]
    );
    if (roundRows.length === 0) {
      return res.status(404).json({ error: 'Round not found' });
    }

    const round = roundRows[0];

    const { rows: proposals } = await db.query(
      `SELECT
        p.*,
        u.display_name AS proposed_by_name
       FROM proposals p
       JOIN users u ON u.id = p.proposed_by
       WHERE p.round_id = $1
       ORDER BY p.vote_score DESC, p.created_at ASC`,
      [id]
    );

    res.json({ round, proposals });
  } catch (err) {
    console.error('Get round error:', err);
    res.status(500).json({ error: 'Failed to fetch round' });
  }
});

// PATCH /api/rounds/:id — update round (admin only)
router.patch('/:id', requireAuth, requireAdmin, [
  body('title').optional().trim().isLength({ min: 1, max: 255 }),
  body('deadline').optional({ nullable: true }).isISO8601(),
  body('status').optional().isIn(['open', 'closed', 'archived']),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { id } = req.params;
  const { title, deadline, status } = req.body;
  const updates = [];
  const values = [];
  let idx = 1;

  if (title !== undefined) { updates.push(`title = $${idx++}`); values.push(title.trim()); }
  if (deadline !== undefined) { updates.push(`deadline = $${idx++}`); values.push(deadline); }
  if (status !== undefined) { updates.push(`status = $${idx++}`); values.push(status); }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  values.push(id);
  try {
    const { rows } = await db.query(
      `UPDATE rounds SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Round not found' });
    }
    res.json({ round: rows[0] });
  } catch (err) {
    console.error('Update round error:', err);
    res.status(500).json({ error: 'Failed to update round' });
  }
});

// POST /api/rounds/:id/close — close the round and tally votes (admin only)
router.post('/:id/close', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const { rows: roundRows } = await db.query(
      'SELECT * FROM rounds WHERE id = $1',
      [id]
    );
    if (roundRows.length === 0) {
      return res.status(404).json({ error: 'Round not found' });
    }
    if (roundRows[0].status !== 'open') {
      return res.status(400).json({ error: 'Round is not open' });
    }

    // Recompute scores (final tally)
    await recomputeScores(id);

    // Determine winner
    const winnerId = await determineWinner(id);

    const { rows } = await db.query(
      `UPDATE rounds SET status = 'closed', winning_proposal_id = $1 WHERE id = $2 RETURNING *`,
      [winnerId, id]
    );

    res.json({ round: rows[0] });
  } catch (err) {
    console.error('Close round error:', err);
    res.status(500).json({ error: 'Failed to close round' });
  }
});

// GET /api/rounds/:id/results — tallied results
router.get('/:id/results', requireAuth, async (req, res) => {
  const { id: roundId } = req.params;
  try {
    const { rows: roundRows } = await db.query(
      'SELECT * FROM rounds WHERE id = $1',
      [roundId]
    );
    if (roundRows.length === 0) {
      return res.status(404).json({ error: 'Round not found' });
    }

    const round = roundRows[0];

    const { rows: proposals } = await db.query(
      `SELECT
        p.*,
        u.display_name AS proposed_by_name,
        COUNT(v.id) AS vote_count,
        COUNT(CASE WHEN v.rank = 1 THEN 1 END) AS first_place_votes,
        COUNT(CASE WHEN v.rank = 2 THEN 1 END) AS second_place_votes,
        COUNT(CASE WHEN v.rank = 3 THEN 1 END) AS third_place_votes
       FROM proposals p
       JOIN users u ON u.id = p.proposed_by
       LEFT JOIN votes v ON v.proposal_id = p.id AND v.round_id = $1
       WHERE p.round_id = $1
       GROUP BY p.id, u.display_name
       ORDER BY p.vote_score DESC, p.created_at ASC`,
      [roundId]
    );

    res.json({
      round,
      proposals: proposals.map(p => ({
        ...p,
        is_winner: round.winning_proposal_id === p.id,
      })),
    });
  } catch (err) {
    console.error('Get results error:', err);
    res.status(500).json({ error: 'Failed to fetch results' });
  }
});

module.exports = router;
