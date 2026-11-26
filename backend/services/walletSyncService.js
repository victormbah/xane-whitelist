// Waitlist -> wallet sync: the waitlist side.
//
// The wallet backend (separate infrastructure, separate database) pulls a snapshot of every
// waitlist member from GET /api/internal/wallet-sync/snapshot and keeps it in its own database,
// so a tag claim in the wallet is decided in one wallet transaction and never waits on this
// server. Nothing is pushed; no account is created on either side by a sync.
//
// Trust and privacy (the same rules are implemented in xane-backend-local
// src/services/waitlist/syncProtocol.ts; the two must stay identical):
//
//   WAITLIST_SYNC_SECRET  one random secret (>= 32 bytes), set only in the two servers' env.
//   signKey  = HMAC-SHA256(secret, "xane/waitlist-sync/sign/v1")
//   emailKey = HMAC-SHA256(secret, "xane/waitlist-sync/email/v1")
//
//   Request : X-Xane-Timestamp (ms), X-Xane-Signature = HMAC(signKey, "GET\n<path>\n<ts>")
//             refused if the timestamp is more than 5 minutes away from now.
//   Response: X-Xane-Signature = HMAC(signKey, "response\n<ts>\n<body>"), bound to the request's
//             timestamp, so an old snapshot cannot be replayed as a new one.
//
//   Emails never leave this server. Each member carries emailHash =
//   HMAC(emailKey, canonicalEmail(email)); the wallet computes the same value from an address
//   its own user has proven with an emailed code, and only then may that account claim the tag.

const crypto = require('crypto');
const { pool } = require('../config/db');
const { HELD_TAG_SQL } = require('./tagService');

const MAX_SKEW_MS = 5 * 60 * 1000;
const SNAPSHOT_PATH = '/api/internal/wallet-sync/snapshot';

/** Same rule as the wallet's src/utils/canonicalEmail.ts: one inbox, one value. */
function canonicalEmail(email) {
  const lower = String(email).trim().toLowerCase();
  const at = lower.lastIndexOf('@');
  if (at < 1) return lower;
  let local = lower.slice(0, at);
  let domain = lower.slice(at + 1);
  const plus = local.indexOf('+');
  if (plus > 0) local = local.slice(0, plus);
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    local = local.replace(/\./g, '');
    domain = 'gmail.com';
  }
  return `${local}@${domain}`;
}

function keys(secret) {
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error('WAITLIST_SYNC_SECRET must be set to at least 32 bytes');
  }
  const derive = (label) => crypto.createHmac('sha256', secret).update(label).digest();
  return {
    signKey: derive('xane/waitlist-sync/sign/v1'),
    emailKey: derive('xane/waitlist-sync/email/v1'),
  };
}

const hmacHex = (key, data) => crypto.createHmac('sha256', key).update(data).digest('hex');

function emailHash(emailKey, email) {
  return hmacHex(emailKey, canonicalEmail(email));
}

function requestSignature(signKey, method, path, ts) {
  return hmacHex(signKey, `${method}\n${path}\n${ts}`);
}

function responseSignature(signKey, ts, body) {
  return hmacHex(signKey, `response\n${ts}\n${body}`);
}

function safeEqualHex(a, b) {
  const x = Buffer.from(String(a || ''), 'hex');
  const y = Buffer.from(String(b || ''), 'hex');
  return x.length === 32 && y.length === 32 && crypto.timingSafeEqual(x, y);
}

/**
 * One entry per member. `tag` is the tag the member holds now (free tag, secured Premium tag, or a
 * Premium reservation still inside its 14 days); expired reservations hold nothing.
 */
async function buildSnapshot(emailKey, db = pool) {
  const { rows } = await db.query(
    `SELECT id, email, status, flagged, level, referral_count, position, created_at,
            ${HELD_TAG_SQL} AS tag,
            CASE
              WHEN is_premium_tag_active AND premium_xane_tag IS NOT NULL THEN 'premium_secured'
              WHEN xane_tag IS NOT NULL THEN 'free'
              WHEN premium_tag_expired_at IS NULL AND premium_xane_tag_requested IS NOT NULL THEN 'premium_reserved'
            END AS tag_kind,
            CASE
              WHEN is_premium_tag_active AND premium_xane_tag IS NOT NULL THEN 'secured'
              WHEN premium_tag_expired_at IS NOT NULL THEN 'expired'
              WHEN premium_xane_tag_requested IS NOT NULL THEN 'reserved'
              ELSE 'none'
            END AS premium_status,
            CASE
              WHEN NOT is_premium_tag_active AND premium_tag_expired_at IS NULL
                   AND premium_xane_tag_requested IS NOT NULL AND xane_tag IS NULL
              THEN premium_xane_tag_deadline
            END AS reservation_ends_at
     FROM waitlist_users
     WHERE email_verified = TRUE
     ORDER BY created_at, id`
  );

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    memberCount: rows.length,
    members: rows.map((r) => ({
      waitlistId: r.id,
      emailHash: emailHash(emailKey, r.email),
      status: r.status,
      flagged: r.flagged,
      level: r.level,
      referralCount: r.referral_count,
      position: r.position,
      joinedAt: r.created_at.toISOString(),
      tag: r.tag ? String(r.tag).toLowerCase() : null,
      tagKind: r.tag ? r.tag_kind : null,
      premiumStatus: r.premium_status,
      reservationEndsAt: r.reservation_ends_at ? r.reservation_ends_at.toISOString() : null,
    })),
  };
}

/** Express handler for GET /api/internal/wallet-sync/snapshot. */
async function snapshotHandler(req, res, next) {
  try {
    const secret = process.env.WAITLIST_SYNC_SECRET;
    if (!secret) return res.status(404).json({ error: 'Not found' }); // integration off

    const { signKey, emailKey } = keys(secret);
    const ts = String(req.get('X-Xane-Timestamp') || '');
    const sig = req.get('X-Xane-Signature');
    const tsNum = Number(ts);

    // One answer for every failure: no hint about which part was wrong.
    if (
      !/^\d{13}$/.test(ts) ||
      Math.abs(Date.now() - tsNum) > MAX_SKEW_MS ||
      !safeEqualHex(sig, requestSignature(signKey, 'GET', SNAPSHOT_PATH, ts))
    ) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const body = JSON.stringify(await buildSnapshot(emailKey));
    res.set('Cache-Control', 'no-store');
    res.set('X-Xane-Signature', responseSignature(signKey, ts, body));
    res.type('application/json').send(body);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  SNAPSHOT_PATH,
  MAX_SKEW_MS,
  canonicalEmail,
  keys,
  emailHash,
  requestSignature,
  responseSignature,
  buildSnapshot,
  snapshotHandler,
};
