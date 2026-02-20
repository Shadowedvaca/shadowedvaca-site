const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

// Router for /api/rounds/:id/proposals (mergeParams to access :id from parent)
const roundProposalsRouter = express.Router({ mergeParams: true });

// POST /api/rounds/:id/proposals — propose a book
roundProposalsRouter.post('/', requireAuth, [
  body('title').trim().isLength({ min: 1, max: 255 }).withMessage('Book title is required'),
  body('author').optional().trim().isLength({ max: 255 }),
  body('description').optional().trim(),
  body('cover_url').optional({ checkFalsy: true }).trim().isURL({ require_protocol: true }).withMessage('cover_url must be a valid URL'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { id: roundId } = req.params;
  const { title, author, description, cover_url } = req.body;

  try {
    const { rows: roundRows } = await db.query(
      'SELECT status FROM rounds WHERE id = $1',
      [roundId]
    );
    if (roundRows.length === 0) {
      return res.status(404).json({ error: 'Round not found' });
    }
    if (roundRows[0].status !== 'open') {
      return res.status(400).json({ error: 'Round is not open for proposals' });
    }

    const { rows } = await db.query(
      `INSERT INTO proposals (round_id, proposed_by, title, author, description, cover_url)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [roundId, req.user.id, title.trim(), author?.trim() || null, description?.trim() || null, cover_url?.trim() || null]
    );

    // Fetch with proposer name
    const { rows: full } = await db.query(
      `SELECT p.*, u.display_name AS proposed_by_name
       FROM proposals p JOIN users u ON u.id = p.proposed_by
       WHERE p.id = $1`,
      [rows[0].id]
    );

    res.status(201).json({ proposal: full[0] });
  } catch (err) {
    console.error('Create proposal error:', err);
    res.status(500).json({ error: 'Failed to create proposal' });
  }
});

// Router for /api/proposals/:id (single proposal operations)
const proposalRouter = express.Router();

// DELETE /api/proposals/:id — delete own proposal (or admin can delete any)
proposalRouter.delete('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;

  try {
    const { rows: propRows } = await db.query(
      `SELECT p.*, r.status AS round_status
       FROM proposals p
       JOIN rounds r ON r.id = p.round_id
       WHERE p.id = $1`,
      [id]
    );

    if (propRows.length === 0) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    const proposal = propRows[0];

    if (proposal.round_status !== 'open') {
      return res.status(400).json({ error: 'Cannot delete proposal: round is not open' });
    }

    if (req.user.role !== 'admin' && proposal.proposed_by !== req.user.id) {
      return res.status(403).json({ error: 'You can only delete your own proposals' });
    }

    await db.query('DELETE FROM proposals WHERE id = $1', [id]);
    res.json({ message: 'Proposal deleted' });
  } catch (err) {
    console.error('Delete proposal error:', err);
    res.status(500).json({ error: 'Failed to delete proposal' });
  }
});

module.exports = { roundProposalsRouter, proposalRouter };
