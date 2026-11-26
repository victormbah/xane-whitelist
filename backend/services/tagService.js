// One place for the rules about who holds which XaneTag.
//
// A tag is held by a waitlist user when it is:
//   - their free tag (xane_tag), or
//   - their secured Premium tag (premium_xane_tag, with is_premium_tag_active), or
//   - their Premium reservation that is still running (premium_xane_tag_requested).
//
// An expired reservation holds nothing: on expiry premium_xane_tag_requested is cleared and the
// name is kept only as history in premium_xane_tag_expired, which availability never reads.
// referral_code is not a tag either: it stays the same for life so links already shared keep
// crediting their owner, and a newcomer who later claims that name gets a different code.

const crypto = require('crypto');

const PREMIUM_REFERRAL_TARGET = 10;
const PREMIUM_WINDOW_DAYS = 14;

/** Every column that holds a tag, compared case-insensitively. */
const TAG_HELD_SQL = `(LOWER(xane_tag) = $1
   OR LOWER(premium_xane_tag_requested) = $1
   OR LOWER(premium_xane_tag) = $1)`;

async function isTagTaken(db, tag) {
  const { rows } = await db.query(
    `SELECT 1 FROM waitlist_users WHERE ${TAG_HELD_SQL} LIMIT 1`,
    [String(tag).toLowerCase()]
  );
  return rows.length > 0;
}

/**
 * Serialises every claim of one tag, across the three columns, for the rest of the transaction.
 * The UNIQUE constraints already stop two rows taking the same tag in the same column; this
 * stops one person taking `name_1` as a free tag while another reserves it as Premium.
 */
async function lockTag(client, tag) {
  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
    `xanetag:${String(tag).toLowerCase()}`,
  ]);
}

/**
 * A referral code for a new member: their tag when no one uses it as a code yet, otherwise the
 * tag with a short random suffix (the name may still be the code of someone whose reservation
 * of it expired).
 */
async function uniqueReferralCode(db, base) {
  const root = String(base).toLowerCase();
  const { rows } = await db.query(
    `SELECT 1 FROM waitlist_users WHERE LOWER(referral_code) = $1 LIMIT 1`,
    [root]
  );
  if (rows.length === 0) return root;

  for (let i = 0; i < 10; i++) {
    const candidate = `${root}_${crypto.randomBytes(3).toString('hex')}`;
    const taken = await db.query(
      `SELECT 1 FROM waitlist_users WHERE LOWER(referral_code) = $1 LIMIT 1`,
      [candidate]
    );
    if (taken.rows.length === 0) return candidate;
  }
  throw new Error('Could not allocate a unique referral code');
}

/** 'secured' | 'reserved' | 'expired' | 'none' */
function premiumStatus(user) {
  if (user.is_premium_tag_active && user.premium_xane_tag) return 'secured';
  if (user.premium_xane_tag_requested && !user.premium_tag_expired_at) return 'reserved';
  if (user.premium_tag_expired_at) return 'expired';
  return 'none';
}

/** The tag this member actually holds right now, or null (e.g. after an expired reservation). */
function heldTag(user) {
  if (user.is_premium_tag_active && user.premium_xane_tag) return user.premium_xane_tag;
  if (user.xane_tag) return user.xane_tag;
  if (premiumStatus(user) === 'reserved') return user.premium_xane_tag_requested;
  return null;
}

/** SQL twin of heldTag(), for list queries. */
const HELD_TAG_SQL = `CASE
    WHEN is_premium_tag_active AND premium_xane_tag IS NOT NULL THEN premium_xane_tag
    WHEN xane_tag IS NOT NULL THEN xane_tag
    WHEN premium_tag_expired_at IS NULL THEN premium_xane_tag_requested
    ELSE NULL
  END`;

function premiumSummary(user) {
  const status = premiumStatus(user);
  return {
    status,
    tag:
      status === 'secured'
        ? user.premium_xane_tag
        : status === 'reserved'
          ? user.premium_xane_tag_requested
          : status === 'expired'
            ? user.premium_xane_tag_expired || user.premium_xane_tag_requested || null
            : null,
    deadline: status === 'reserved' ? user.premium_xane_tag_deadline : null,
    expiredAt: status === 'expired' ? user.premium_tag_expired_at : null,
    target: PREMIUM_REFERRAL_TARGET,
  };
}

function referralLink(user, frontendUrl) {
  const base = frontendUrl || process.env.FRONTEND_URL || 'https://www.xane.app';
  return user.referral_code
    ? `${base}/waitlist?ref=${encodeURIComponent(user.referral_code)}`
    : `${base}/waitlist`;
}

module.exports = {
  PREMIUM_REFERRAL_TARGET,
  PREMIUM_WINDOW_DAYS,
  TAG_HELD_SQL,
  HELD_TAG_SQL,
  isTagTaken,
  lockTag,
  uniqueReferralCode,
  premiumStatus,
  heldTag,
  premiumSummary,
  referralLink,
};
