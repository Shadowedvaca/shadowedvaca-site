const { randomBytes } = require('crypto');

/**
 * Generate a random invite code.
 * Format: 8 uppercase alphanumeric chars.
 * Decision: Simple random hex-based code, short enough to share easily.
 */
function generateInviteCode() {
  return randomBytes(4).toString('hex').toUpperCase();
}

module.exports = { generateInviteCode };
