const { pool } = require('../config/db');
const { HELD_TAG_SQL } = require('../services/tagService');

const LEVEL_BADGE_LABEL = {
  waitlist_member: 'Waitlist Member',
  scout: 'Xane Scout',
  advocate: 'Xane Advocate',
  ambassador: 'Xane Ambassador',
  lead: 'Xane Lead',
  captain: 'Xane Captain',
  founding_council: 'Xane Founding Council',
};

/**
 * Public leaderboard: username, badge, referral ("friends") count only.
 * No phone, email, full name, or anything else — flagged users are
 * excluded entirely and don't count toward anyone else's total either
 * (enforced by referral_events only ever crediting non-flagged referrers
 * at the point a referral is registered).
 */
async function getLeaderboard(req, res, next) {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 200);

    const { rows } = await pool.query(
      `SELECT
         ${HELD_TAG_SQL} AS tag,
         level,
         referral_count
       FROM waitlist_users
       WHERE status = 'active' AND flagged = FALSE
       ORDER BY referral_count DESC, base_position ASC
       LIMIT $1`,
      [limit]
    );

    const leaderboard = rows.map((row, index) => ({
      rank: index + 1,
      // An expired reservation holds no tag: never show the released name.
      username: row.tag ? `@${row.tag}` : 'Xane member',
      badge: LEVEL_BADGE_LABEL[row.level] || row.level,
      friends: row.referral_count,
    }));

    res.json({ leaderboard });
  } catch (err) {
    next(err);
  }
}

module.exports = { getLeaderboard };
