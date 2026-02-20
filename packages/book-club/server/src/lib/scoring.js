const db = require('../db');

/**
 * Recompute vote_score for all proposals in a round.
 * For ranked_choice: rank 1 = 3pts, rank 2 = 2pts, rank 3 = 1pt
 * For approval: each vote = 1pt
 *
 * Decision: We recalculate via aggregation query then bulk UPDATE.
 */
async function recomputeScores(roundId) {
  const { rows: roundRows } = await db.query(
    'SELECT voting_method FROM rounds WHERE id = $1',
    [roundId]
  );

  if (roundRows.length === 0) {
    throw new Error('Round not found');
  }

  const votingMethod = roundRows[0].voting_method;

  if (votingMethod === 'ranked_choice') {
    // Weighted: rank 1 = 3pts, rank 2 = 2pts, rank 3 = 1pt
    await db.query(`
      UPDATE proposals p
      SET vote_score = COALESCE(sub.score, 0)
      FROM (
        SELECT
          proposal_id,
          SUM(CASE
            WHEN rank = 1 THEN 3
            WHEN rank = 2 THEN 2
            WHEN rank = 3 THEN 1
            ELSE 0
          END) AS score
        FROM votes
        WHERE round_id = $1
        GROUP BY proposal_id
      ) sub
      WHERE p.id = sub.proposal_id AND p.round_id = $1
    `, [roundId]);

    // Zero out proposals with no votes
    await db.query(`
      UPDATE proposals
      SET vote_score = 0
      WHERE round_id = $1
        AND id NOT IN (SELECT proposal_id FROM votes WHERE round_id = $1)
    `, [roundId]);

  } else {
    // Approval: count of votes per proposal
    await db.query(`
      UPDATE proposals p
      SET vote_score = COALESCE(sub.score, 0)
      FROM (
        SELECT proposal_id, COUNT(*) AS score
        FROM votes
        WHERE round_id = $1
        GROUP BY proposal_id
      ) sub
      WHERE p.id = sub.proposal_id AND p.round_id = $1
    `, [roundId]);

    // Zero out proposals with no votes
    await db.query(`
      UPDATE proposals
      SET vote_score = 0
      WHERE round_id = $1
        AND id NOT IN (SELECT proposal_id FROM votes WHERE round_id = $1)
    `, [roundId]);
  }
}

/**
 * Determine the winning proposal for a round.
 * Tie-breaking:
 * - ranked_choice: most 1st-place votes, then 2nd-place, then earliest created_at
 * - approval: earliest created_at
 *
 * Returns the winning proposal_id or null if no proposals.
 */
async function determineWinner(roundId) {
  const { rows: roundRows } = await db.query(
    'SELECT voting_method FROM rounds WHERE id = $1',
    [roundId]
  );

  if (roundRows.length === 0) return null;

  const votingMethod = roundRows[0].voting_method;

  if (votingMethod === 'ranked_choice') {
    const { rows } = await db.query(`
      SELECT
        p.id,
        p.vote_score,
        p.created_at,
        COUNT(CASE WHEN v.rank = 1 THEN 1 END) AS first_place_votes,
        COUNT(CASE WHEN v.rank = 2 THEN 1 END) AS second_place_votes
      FROM proposals p
      LEFT JOIN votes v ON v.proposal_id = p.id AND v.round_id = $1
      WHERE p.round_id = $1
      GROUP BY p.id, p.vote_score, p.created_at
      ORDER BY
        p.vote_score DESC,
        first_place_votes DESC,
        second_place_votes DESC,
        p.created_at ASC
      LIMIT 1
    `, [roundId]);

    return rows.length > 0 ? rows[0].id : null;
  } else {
    // Approval: highest score, ties broken by earliest created_at
    const { rows } = await db.query(`
      SELECT id
      FROM proposals
      WHERE round_id = $1
      ORDER BY vote_score DESC, created_at ASC
      LIMIT 1
    `, [roundId]);

    return rows.length > 0 ? rows[0].id : null;
  }
}

module.exports = { recomputeScores, determineWinner };
