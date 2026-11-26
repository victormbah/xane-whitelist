const { pool } = require('../config/db');
const { levelForReferralCount } = require('./levelService');
const { sendLevelUpEmail } = require('./emailService');
const { PREMIUM_REFERRAL_TARGET, PREMIUM_WINDOW_DAYS } = require('./tagService');

const POSITION_JUMP = parseInt(process.env.REFERRAL_POSITION_JUMP || '3', 10);

/**
 * Computes a user's displayed waitlist position from their base (signup-order)
 * position minus the boost earned from referrals. This is an approximation
 * of a global rank that only depends on the user's own row, so it's safe to
 * update without touching every other user's position in the same
 * transaction. The public leaderboard ranks by referral_count directly
 * rather than this derived number.
 */
function computeDisplayPosition(basePosition, referralCount) {
  const boosted = basePosition - referralCount * POSITION_JUMP;
  return Math.max(1, boosted);
}

/**
 * Call once a user's status flips to 'active' (phone + email + telegram all
 * verified) to hand out their place in line.
 */
async function assignBasePosition(userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT COALESCE(MAX(base_position), 0) + 1 AS next_position
       FROM waitlist_users WHERE status = 'active'`
    );
    const basePosition = rows[0].next_position;
    await client.query(
      `UPDATE waitlist_users
       SET base_position = $1, position = $1
       WHERE id = $2`,
      [basePosition, userId]
    );
    await client.query('COMMIT');
    return basePosition;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Registers that `referredUserId` joined via `referrerId`'s link, bumps the
 * referrer's referral count + position, and handles level-ups (including
 * activating a premium XaneTag at the Advocate threshold, if earned within
 * the 14-day window).
 */
async function registerReferral({ referrerId, referredUserId }) {
  if (referrerId === referredUserId) return null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Unique constraint on referral_events.referred_id makes this idempotent:
    // a user can only ever be credited to one referrer, once.
    const inserted = await client.query(
      `INSERT INTO referral_events (referrer_id, referred_id)
       VALUES ($1, $2)
       ON CONFLICT (referred_id) DO NOTHING
       RETURNING id`,
      [referrerId, referredUserId]
    );

    if (inserted.rowCount === 0) {
      await client.query('ROLLBACK');
      return null; // already credited, nothing to do
    }

    const { rows } = await client.query(
  `UPDATE waitlist_users
   SET referral_count = referral_count + 1
   WHERE id = $1
     AND flagged = FALSE
   RETURNING *`,
  [referrerId]
);

if (rows.length === 0) {
  await client.query('ROLLBACK');
  return null;
}
    const referrer = rows[0];

    const newPosition = computeDisplayPosition(referrer.base_position || 0, referrer.referral_count);
    const previousLevel = referrer.level;
    const newLevelInfo = levelForReferralCount(referrer.referral_count);

    // Secure a Premium reservation the moment the 10th successful referral lands inside its
    // 14-day window. Counted from referral_events (this one included) instead of from the level
    // change, so it does not depend on the member crossing into 'advocate' with this referral.
    // The row is locked by the UPDATE above, so the expiry job cannot interleave.
    let premiumTagActivated = null;
    if (
      referrer.premium_xane_tag_requested &&
      !referrer.is_premium_tag_active &&
      !referrer.premium_xane_tag &&
      !referrer.premium_tag_expired_at &&
      referrer.premium_xane_tag_deadline &&
      new Date(referrer.premium_xane_tag_deadline) >= new Date()
    ) {
      const { rows: windowRows } = await client.query(
        `SELECT COUNT(*)::int AS n FROM referral_events
         WHERE referrer_id = $1 AND created_at <= $2`,
        [referrerId, referrer.premium_xane_tag_deadline]
      );
      if (windowRows[0].n >= PREMIUM_REFERRAL_TARGET) {
        premiumTagActivated = referrer.premium_xane_tag_requested;
      }
    }

    await client.query(
  `UPDATE waitlist_users
   SET position = $1,
       level = $2,
       premium_xane_tag = COALESCE($3, premium_xane_tag),
       is_premium_tag_active = is_premium_tag_active OR $3 IS NOT NULL,
       premium_tag_activated_at = CASE
         WHEN $3 IS NOT NULL THEN NOW()
         ELSE premium_tag_activated_at
       END
   WHERE id = $4`,
  [newPosition, newLevelInfo.key, premiumTagActivated, referrerId]
);

    await client.query('COMMIT');

    if (newLevelInfo.key !== previousLevel) {
      // Best-effort; don't fail the referral if the email send has an issue.
      sendLevelUpEmail({ userId: referrerId, level: newLevelInfo.key }).catch((err) =>
        console.error('Failed to send level-up email:', err.message)
      );
    }

    return { referrer: { ...referrer, position: newPosition, level: newLevelInfo.key }, premiumTagActivated };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

function premiumTagDeadline() {
  return new Date(Date.now() + PREMIUM_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

module.exports = { computeDisplayPosition, assignBasePosition, registerReferral, premiumTagDeadline };
