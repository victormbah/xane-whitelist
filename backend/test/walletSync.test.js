// The waitlist side of the wallet sync: who is in the snapshot, what it reveals, and who may read it.
//   TEST_DATABASE_URL=postgres://user@localhost:5432/waitlist_test npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const Module = require('node:module');

const TEST_DB = process.env.TEST_DATABASE_URL;
if (!TEST_DB) throw new Error('Set TEST_DATABASE_URL to a disposable local database.');
if (!['localhost', '127.0.0.1', '::1'].includes(new URL(TEST_DB).hostname)) {
  throw new Error('Refusing to run against a non-local database');
}
process.env.DATABASE_URL = TEST_DB;
process.env.DATABASE_SSL = 'false';
process.env.FRONTEND_URL = 'https://waitlist.test';
process.env.WAITLIST_SYNC_SECRET = 'test-secret-0123456789abcdef0123456789abcdef';

const resendPath = require.resolve('../config/resend');
const fake = new Module(resendPath);
fake.filename = resendPath;
fake.loaded = true;
fake.exports = { sendEmail: async () => ({}), sendEmailOtp: async () => {} };
require.cache[resendPath] = fake;

const { pool } = require('../config/db');
const app = require('../app');
const sync = require('../services/walletSyncService');
const { buildCorrectedExpiryEmail } = require('../services/emailService');
const { releaseExpiredReservations } = require('../services/premiumTagChallengeService');

let server;
let base;
const { signKey, emailKey } = sync.keys(process.env.WAITLIST_SYNC_SECRET);

async function get(ts = String(Date.now()), sig) {
  const res = await fetch(`${base}${sync.SNAPSHOT_PATH}`, {
    headers: {
      'X-Xane-Timestamp': ts,
      'X-Xane-Signature': sig ?? sync.requestSignature(signKey, 'GET', sync.SNAPSHOT_PATH, ts),
    },
  });
  return { status: res.status, text: await res.text(), sig: res.headers.get('x-xane-signature'), ts };
}

async function member(o) {
  const { rows } = await pool.query(
    `INSERT INTO waitlist_users (full_name, phone_verified, email, email_verified, xane_tag, referral_code,
       premium_xane_tag_requested, premium_xane_tag_deadline, premium_xane_tag, is_premium_tag_active,
       premium_tag_expired_at, premium_xane_tag_expired, status, level, referral_count)
     VALUES ('M', TRUE, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
    [o.email, o.verified ?? true, o.free ?? null, o.code, o.requested ?? null, o.deadline ?? null,
     o.secured ?? null, Boolean(o.secured), o.expiredAt ?? null, o.expiredTag ?? null,
     o.status ?? 'active', o.level ?? 'waitlist_member', o.count ?? 0]
  );
  return rows[0];
}

test.before(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  const runJs = fs.readFileSync(path.join(__dirname, '..', 'migrations', 'run.js'), 'utf8');
  for (const f of runJs.match(/\d{3}_[a-z_]+\.sql/g)) {
    await pool.query(fs.readFileSync(path.join(__dirname, '..', 'migrations', f), 'utf8'));
  }
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  server.close();
  await pool.end();
});

test('snapshot: held tags only, hashed emails, signed response', async () => {
  const free = await member({ email: 'Free.Person@Gmail.com', free: 'free_one', code: 'free_one', level: 'scout', count: 4 });
  const secured = await member({ email: 'secured@example.test', requested: 'obaj', secured: 'obaj', code: 'obaj', level: 'advocate', count: 26 });
  const running = await member({ email: 'running@example.test', requested: 'running', code: 'running', deadline: new Date(Date.now() + 5 * 86400000) });
  const expired = await member({ email: 'expired@example.test', code: 'victor', expiredAt: new Date(), expiredTag: 'victor', count: 3, level: 'scout' });
  const stuck = await member({ email: 'stuck@example.test', requested: 'stuckname', code: 'stuckname', expiredAt: new Date() });
  await member({ email: 'unverified@example.test', free: 'unverif_1', code: 'unverif_1', verified: false });

  const r = await get();
  assert.equal(r.status, 200);
  assert.equal(r.sig, sync.responseSignature(signKey, r.ts, r.text), 'response is signed and bound to the request');
  assert.doesNotMatch(r.text, /@example\.test|gmail\.com/i, 'no plaintext email leaves the waitlist');

  const snap = JSON.parse(r.text);
  const byId = Object.fromEntries(snap.members.map((m) => [m.waitlistId, m]));
  assert.equal(snap.memberCount, 5, 'unverified emails are not members the wallet can match');

  assert.deepEqual(
    [byId[free.id].tag, byId[free.id].tagKind, byId[free.id].level, byId[free.id].referralCount],
    ['free_one', 'free', 'scout', 4]
  );
  assert.equal(byId[free.id].emailHash, sync.emailHash(emailKey, 'freeperson@gmail.com'), 'canonical inbox');
  assert.deepEqual([byId[secured.id].tag, byId[secured.id].tagKind, byId[secured.id].premiumStatus], ['obaj', 'premium_secured', 'secured']);
  assert.deepEqual([byId[running.id].tag, byId[running.id].tagKind], ['running', 'premium_reserved']);
  assert.ok(byId[running.id].reservationEndsAt);
  assert.deepEqual([byId[expired.id].tag, byId[expired.id].premiumStatus, byId[expired.id].referralCount], [null, 'expired', 3]);
  assert.equal(byId[stuck.id].tag, null, 'an expired reservation holds nothing even before its tag is released');
});

test('snapshot refuses bad, stale, future and replayed-signature requests', async () => {
  const now = Date.now();
  assert.equal((await get(String(now), 'ab'.repeat(32))).status, 401, 'wrong signature');
  const old = String(now - 6 * 60 * 1000);
  assert.equal((await get(old)).status, 401, 'older than 5 minutes');
  assert.equal((await get(String(now + 6 * 60 * 1000))).status, 401, 'too far in the future');
  assert.equal((await get('12345')).status, 401, 'malformed timestamp');
  // A signature for one timestamp does not work with another.
  const sigForOld = sync.requestSignature(signKey, 'GET', sync.SNAPSHOT_PATH, String(now - 1000));
  assert.equal((await get(String(now), sigForOld)).status, 401);
  // No headers at all.
  assert.equal((await fetch(`${base}${sync.SNAPSHOT_PATH}`)).status, 401);
});

test('integration off when no secret is configured', async () => {
  const saved = process.env.WAITLIST_SYNC_SECRET;
  delete process.env.WAITLIST_SYNC_SECRET;
  try {
    assert.equal((await get()).status, 404);
  } finally {
    process.env.WAITLIST_SYNC_SECRET = saved;
  }
});

test('WAITLIST_CLOSED stops new sign-ups at launch', async () => {
  process.env.WAITLIST_CLOSED = 'true';
  try {
    const res = await fetch(`${base}/api/waitlist/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName: 'Late', email: 'late@example.test', xaneTag: 'late_1' }),
    });
    assert.equal(res.status, 410);
    assert.equal((await res.json()).code, 'WAITLIST_CLOSED');
  } finally {
    delete process.env.WAITLIST_CLOSED;
  }
});

test('corrected expiry email: personal link, released name, kept benefits', async () => {
  const u = await member({ email: 'fix@example.test', requested: 'fixme_tag', code: 'fixme_tag', expiredAt: new Date(), count: 2, level: 'waitlist_member' });
  await releaseExpiredReservations();
  const row = (await pool.query('SELECT * FROM waitlist_users WHERE id = $1', [u.id])).rows[0];
  const { subject, html } = buildCorrectedExpiryEmail(row);
  assert.match(subject, /Correction/);
  assert.match(html, /https:\/\/waitlist\.test\/waitlist\?ref=fixme_tag/);
  assert.match(html, /ref%3Dfixme_tag/);
  assert.match(html, /has now been released/);
  assert.match(html, /2 referrals/);
});
