const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { recomputeScores } = require('../lib/scoring');

// Mounted at /api/rounds/:id/votes (mergeParams to access :id)
const votesRouter = express.Router({ mergeParams: true });

// POST /api/rounds/:id/votes — submit votes (UPSERT, replaces existing)
votesRouter.post('/', requireAuth, [
  body('votes').isArray().withMessage('votes must be an array'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { id: roundId } = req.params;
  const { votes } = req.body;

  try {
    const { rows: roundRows } = await db.query(
      'SELECT status, voting_method FROM rounds WHERE id = $1',
      [roundId]
    );
    if (roundRows.length === 0) {
      return res.status(404).json({ error: 'Round not found' });
    }
    if (roundRows[0].status !== 'open') {
      return res.status(400).json({ error: 'Round is not open for voting' });
    }

    const votingMethod = roundRows[0].voting_method;

    if (votingMethod === 'ranked_choice') {
      if (votes.length > 3) {
        return res.status(400).json({ error: 'Ranked choice allows at most 3 votes' });
      }
      for (const v of votes) {
        if (!v.proposal_id) {
          return res.status(400).json({ error: 'Each vote must have a proposal_id' });
        }
        if (![1, 2, 3].includes(v.rank)) {
          return res.status(400).json({ error: 'Rank must be 1, 2, or 3 for ranked_choice' });
        }
      }
      const ranks = votes.map(v => v.rank);
      if (new Set(ranks).size !== ranks.length) {
        return res.status(400).json({ error: 'Duplicate ranks are not allowed' });
      }
    } else {
      for (const v of votes) {
        if (!v.proposal_id) {
          return res.status(400).json({ error: 'Each vote must have a proposal_id' });
        }
      }
    }

    if (votes.length > 0) {
      const proposalIds = votes.map(v => v.proposal_id);
      const { rows: validProps } = await db.query(
        `SELECT id FROM proposals WHERE id = ANY($1) AND round_id = $2`,
        [proposalIds, roundId]
      );
      if (validProps.length !== proposalIds.length) {
        return res.status(400).json({ error: 'One or more proposal_ids do not belong to this round' });
      }
    }

    // Delete existing votes by this user in this round (UPSERT = replace)
    await db.query(
      'DELETE FROM votes WHERE round_id = $1 AND user_id = $2',
      [roundId, req.user.id]
    );

    if (votes.length > 0) {
      for (const v of votes) {
        const rank = votingMethod === 'approval' ? 1 : v.rank;
        await db.query(
          `INSERT INTO votes (round_id, user_id, proposal_id, rank)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (round_id, user_id, proposal_id) DO UPDATE SET rank = EXCLUDED.rank`,
          [roundId, req.user.id, v.proposal_id, rank]
        );
      }
    }

    await recomputeScores(roundId);

    res.json({ message: 'Votes submitted successfully' });
  } catch (err) {
    console.error('Submit votes error:', err);
    res.status(500).json({ error: 'Failed to submit votes' });
  }
});

// GET /api/rounds/:id/votes/mine — get current user's votes
votesRouter.get('/mine', requireAuth, async (req, res) => {
  const { id: roundId } = req.params;
  try {
    const { rows } = await db.query(
      `SELECT v.*, p.title AS proposal_title
       FROM votes v
       JOIN proposals p ON p.id = v.proposal_id
       WHERE v.round_id = $1 AND v.user_id = $2
       ORDER BY v.rank ASC`,
      [roundId, req.user.id]
    );
    res.json({ votes: rows });
  } catch (err) {
    console.error('Get my votes error:', err);
    res.status(500).json({ error: 'Failed to fetch votes' });
  }
});

module.exports = votesRouter;
