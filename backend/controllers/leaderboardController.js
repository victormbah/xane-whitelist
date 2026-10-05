const { pool } = require('../config/db');

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
         CASE
  WHEN is_premium_tag_active AND premium_xane_tag IS NOT NULL
    THEN premium_xane_tag
  WHEN xane_tag IS NOT NULL
    THEN xane_tag
  ELSE premium_xane_tag_requested
END AS tag,
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
      username: `@${row.tag}`,
      badge: LEVEL_BADGE_LABEL[row.level] || row.level,
      friends: row.referral_count,
    }));

    res.json({ leaderboard });
  } catch (err) {
    next(err);
  }
}

module.exports = { getLeaderboard };
