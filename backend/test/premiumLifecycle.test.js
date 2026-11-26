// Premium XaneTag lifecycle, end to end against a real PostgreSQL database.
//
//   TEST_DATABASE_URL=postgres://user@localhost:5432/waitlist_test npm test
//
// The database is wiped and rebuilt from migrations/ on every run, so the URL must point at a
// local, disposable database: anything that is not localhost is refused. Email sending is replaced
// by an in-memory outbox; nothing leaves the machine.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const Module = require('node:module');

const TEST_DB = process.env.TEST_DATABASE_URL;
if (!TEST_DB) {
  throw new Error('Set TEST_DATABASE_URL to a disposable local database.');
}
const host = new URL(TEST_DB).hostname;
if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
  throw new Error(`Refusing to run against non-local database host ${host}`);
}

process.env.DATABASE_URL = TEST_DB;
process.env.DATABASE_SSL = 'false';
process.env.FRONTEND_URL = 'https://waitlist.test';
process.env.TELEGRAM_BOT_USERNAME = 'xane_test_bot';
delete process.env.RESEND_API_KEY;

// ---- in-memory outbox in place of Resend -----------------------------------
const outbox = [];
let failNextEmail = false;
const resendPath = require.resolve('../config/resend');
const fake = new Module(resendPath);
fake.filename = resendPath;
fake.loaded = true;
fake.exports = {
  async sendEmail({ toEmail, subject, html }) {
    if (failNextEmail) {
      failNextEmail = false;
      throw new Error('Resend email failed: simulated outage');
    }
    outbox.push({ toEmail, subject, html });
    return { id: `test-${outbox.length}` };
  },
  async sendEmailOtp({ email, code, signIn }) {
    outbox.push({ toEmail: email, subject: signIn ? 'sign-in code' : 'verification code', code });
  },
};
require.cache[resendPath] = fake;

const { pool } = require('../config/db');
const app = require('../app');
const challenge = require('../services/premiumTagChallengeService');
const referralService = require('../services/referralService');

let server;
let base;

async function api(method, url, body) {
  const res = await fetch(`${base}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const DAY = 24 * 60 * 60 * 1000;
let seq = 0;

/** Inserts a member directly, the way a completed sign-up leaves the row. */
async function member({ premium = null, free = null, deadlineInDays = 14, status = 'active' } = {}) {
  seq++;
  const tag = free || premium;
  const { rows } = await pool.query(
    `INSERT INTO waitlist_users
       (full_name, phone_verified, email, email_verified, telegram_verified, xane_tag, referral_code,
        premium_xane_tag_requested, premium_xane_tag_deadline, status, base_position, position)
     VALUES ($1, TRUE, $2, TRUE, TRUE, $3, $4, $5, $6, $7, $8, $8)
     RETURNING *`,
    [
      `Member ${seq}`,
      `member${seq}@example.test`,
      free,
      tag || `code${seq}`,
      premium,
      premium ? new Date(Date.now() + deadlineInDays * DAY) : null,
      status,
      seq,
    ]
  );
  return rows[0];
}

async function referrals(referrer, n, { at } = {}) {
  for (let i = 0; i < n; i++) {
    const friend = await member({ free: `friend_${seq + 1}` });
    await referralService.registerReferral({ referrerId: referrer.id, referredUserId: friend.id });
    if (at) {
      await pool.query(`UPDATE referral_events SET created_at = $1 WHERE referred_id = $2`, [at, friend.id]);
    }
  }
}

async function row(id) {
  return (await pool.query(`SELECT * FROM waitlist_users WHERE id = $1`, [id])).rows[0];
}

async function endWindow(user) {
  // Move the deadline into the past; referral events already written keep their times.
  await pool.query(
    `UPDATE waitlist_users SET premium_xane_tag_deadline = NOW() - INTERVAL '1 minute' WHERE id = $1`,
    [user.id]
  );
}

async function verifiedEmail(email) {
  await pool.query(
    `INSERT INTO otp_codes (identifier, purpose, sendchamp_reference, expires_at, verified)
     VALUES ($1, 'email', 'test', NOW() + INTERVAL '10 minutes', TRUE)`,
    [email]
  );
}

const settle = () => new Promise((r) => setTimeout(r, 50)); // fire-and-forget emails

test.before(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  for (const f of ['001_init.sql', '002_email_otp.sql', '003_premium_tag_challenge.sql', '004_premium_tag_release.sql']) {
    await pool.query(fs.readFileSync(path.join(__dirname, '..', 'migrations', f), 'utf8'));
  }
  // 004 is re-runnable, as migrations/run.js runs every file on every deploy.
  await pool.query(fs.readFileSync(path.join(__dirname, '..', 'migrations', '004_premium_tag_release.sql'), 'utf8'));
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await settle();
  server.close();
  await pool.end();
});

test.beforeEach(() => {
  outbox.length = 0;
  failNextEmail = false;
});

// ---------------------------------------------------------------------------

test('expired reservation: tag released, membership/referrals/level kept, email has personal link', async () => {
  const victor = await member({ premium: 'victor' });
  await referrals(victor, 3);
  await endWindow(victor);
  await settle();
  outbox.length = 0;
  const beforeExpiry = await row(victor.id);

  assert.equal((await api('GET', '/api/waitlist/check-username?tag=victor&type=premium')).body.available, false);

  await challenge.processPremiumTagChallenges();

  const after = await row(victor.id);
  assert.equal(after.premium_xane_tag_requested, null, 'reservation cleared');
  assert.equal(after.premium_xane_tag_expired, 'victor', 'history kept');
  assert.ok(after.premium_tag_expired_at);
  assert.ok(after.premium_expiry_email_sent_at);
  assert.equal(after.email, victor.email);
  assert.equal(after.referral_code, 'victor', 'referral link unchanged');
  assert.equal(after.referral_count, 3);
  assert.equal(after.level, 'scout');
  assert.equal(after.position, beforeExpiry.position);
  assert.equal(after.base_position, beforeExpiry.base_position);
  assert.equal(after.status, 'active');

  const avail = await api('GET', '/api/waitlist/check-username?tag=victor&type=premium');
  assert.deepEqual(avail.body, { available: true });

  const mails = outbox.filter((m) => /has expired/.test(m.subject));
  assert.equal(mails.length, 1);
  assert.match(mails[0].html, /https:\/\/waitlist\.test\/waitlist\?ref=victor/);
  // Both share buttons carry the personal link too (the footer's "Visit Xane" is the homepage).
  assert.match(mails[0].html, /wa\.me\/\?text=[^"]*ref%3Dvictor/);
  assert.match(mails[0].html, /t\.me\/share\/url\?url=[^"]*ref%3Dvictor/);
  assert.match(mails[0].html, /3 referrals/);
  assert.doesNotMatch(mails[0].html, /Your target is/);

  // Running again sends nothing more and changes nothing.
  await challenge.processPremiumTagChallenges();
  assert.equal(outbox.filter((m) => /has expired/.test(m.subject)).length, 1);
});

test('rows stuck by the old bug (expired + emailed, tag still held) are released without re-emailing', async () => {
  const stuck = await member({ premium: 'stucktag' });
  await pool.query(
    `UPDATE waitlist_users
     SET premium_xane_tag_deadline = NOW() - INTERVAL '30 days',
         premium_tag_expired_at = NOW() - INTERVAL '30 days',
         premium_expiry_email_sent_at = NOW() - INTERVAL '30 days'
     WHERE id = $1`,
    [stuck.id]
  );
  assert.equal((await api('GET', '/api/waitlist/check-username?tag=stucktag&type=premium')).body.available, false);

  await challenge.processPremiumTagChallenges();

  const after = await row(stuck.id);
  assert.equal(after.premium_xane_tag_requested, null);
  assert.equal(after.premium_xane_tag_expired, 'stucktag');
  assert.equal(after.referral_code, 'stucktag');
  assert.equal(outbox.length, 0, 'no second expiry email');
  assert.equal((await api('GET', '/api/waitlist/check-username?tag=stucktag&type=premium')).body.available, true);
});

test('10 referrals inside the window secure the tag at once; it survives the deadline', async () => {
  const ada = await member({ premium: 'adaeze' });
  await referrals(ada, 10);

  let after = await row(ada.id);
  assert.equal(after.is_premium_tag_active, true);
  assert.equal(after.premium_xane_tag, 'adaeze');
  assert.equal(after.level, 'advocate');

  await endWindow(ada);
  await challenge.processPremiumTagChallenges();
  after = await row(ada.id);
  assert.equal(after.is_premium_tag_active, true);
  assert.equal(after.premium_tag_expired_at, null);
  assert.equal(after.premium_xane_tag, 'adaeze');

  const me = await api('GET', `/api/waitlist/me/${ada.id}`);
  assert.equal(me.body.xaneTag, 'adaeze');
  assert.equal(me.body.premium.status, 'secured');
  assert.equal((await api('GET', '/api/waitlist/check-username?tag=adaeze&type=premium')).body.available, false);
  assert.equal(outbox.filter((m) => /has expired/.test(m.subject)).length, 0);
});

test('a referral that lands after the deadline does not count, even before the job runs', async () => {
  const late = await member({ premium: 'latecomer' });
  await referrals(late, 9);
  await endWindow(late);
  await referrals(late, 1); // 10th, but after the deadline

  let after = await row(late.id);
  assert.equal(after.referral_count, 10);
  assert.equal(after.is_premium_tag_active, false, 'not secured by the late referral');

  await challenge.processPremiumTagChallenges();
  after = await row(late.id);
  assert.equal(after.premium_xane_tag_requested, null, 'expired and released');
  assert.equal(after.referral_count, 10, 'all referrals still count for level/leaderboard');
  assert.equal(after.level, 'advocate');
});

test('catch-up: 10 in-window referrals that were never activated get secured, not expired', async () => {
  const missed = await member({ premium: 'missedone' });
  await referrals(missed, 10);
  // Simulate the old behaviour, where activation could be skipped.
  await pool.query(
    `UPDATE waitlist_users SET is_premium_tag_active = FALSE, premium_xane_tag = NULL, premium_tag_activated_at = NULL WHERE id = $1`,
    [missed.id]
  );
  await endWindow(missed);
  // The events happened inside the window (before the new deadline).
  await pool.query(`UPDATE referral_events SET created_at = NOW() - INTERVAL '2 days' WHERE referrer_id = $1`, [missed.id]);

  await challenge.processPremiumTagChallenges();
  const after = await row(missed.id);
  assert.equal(after.is_premium_tag_active, true);
  assert.equal(after.premium_xane_tag, 'missedone');
  assert.equal(after.premium_tag_expired_at, null);
});

test('email outage at expiry: the tag is still released, the email is retried next run', async () => {
  const u = await member({ premium: 'outage_tag' });
  await endWindow(u);
  failNextEmail = true;

  await challenge.processPremiumTagChallenges();
  let after = await row(u.id);
  assert.equal(after.premium_xane_tag_requested, null, 'released despite email failure');
  assert.equal(after.premium_expiry_email_sent_at, null);

  await challenge.processPremiumTagChallenges();
  after = await row(u.id);
  assert.ok(after.premium_expiry_email_sent_at);
  assert.equal(outbox.filter((m) => /has expired/.test(m.subject)).length, 1);
});

test('day-7 reminder goes once, with 7 days left and fewer than 10 referrals', async () => {
  const u = await member({ premium: 'remindme', deadlineInDays: 6.9 });
  await challenge.processPremiumTagChallenges();
  await challenge.processPremiumTagChallenges();
  const reminders = outbox.filter((m) => /7 days left/.test(m.subject));
  assert.equal(reminders.length, 1);
  assert.match(reminders[0].html, /ref=remindme/);
  assert.ok((await row(u.id)).premium_day7_email_sent_at);
});

test('duplicate registration: an expired member cannot sign up again or restart the window', async () => {
  const exp = await member({ premium: 'again_tag' });
  await endWindow(exp);
  await challenge.processPremiumTagChallenges();
  const before = await row(exp.id);

  const otp = await api('POST', '/api/waitlist/otp/request', { identifier: exp.email, purpose: 'email' });
  assert.equal(otp.status, 400);
  assert.match(otp.body.error, /already registered/i);

  await verifiedEmail(exp.email);
  for (const body of [
    { fullName: 'Again', email: exp.email, premiumXaneTag: 'again_tag' },
    { fullName: 'Again', email: exp.email.toUpperCase(), premiumXaneTag: 'fresh_name' },
    { fullName: 'Again', email: ` ${exp.email} `, xaneTag: 'fresh_name_1' },
  ]) {
    const r = await api('POST', '/api/waitlist/join', body);
    assert.equal(r.status, 409, JSON.stringify(body));
    assert.equal(r.body.code, 'ALREADY_REGISTERED');
  }

  const after = await row(exp.id);
  assert.equal(after.premium_xane_tag_requested, null);
  assert.deepEqual(after.premium_tag_expired_at, before.premium_tag_expired_at);
  assert.equal((await pool.query(`SELECT COUNT(*)::int n FROM waitlist_users WHERE LOWER(email) = $1`, [exp.email])).rows[0].n, 1);
});

test('sign in with an email code: works once, no account enumeration, returns the dashboard', async () => {
  const u = await member({ premium: 'signin_me' });
  await referrals(u, 2);
  await endWindow(u);
  await challenge.processPremiumTagChallenges();
  outbox.length = 0;

  const unknown = await api('POST', '/api/waitlist/login/request', { email: 'nobody@example.test' });
  assert.equal(unknown.status, 200);
  assert.equal(outbox.length, 0, 'no email to an unknown address');

  const known = await api('POST', '/api/waitlist/login/request', { email: u.email.toUpperCase() });
  assert.equal(known.status, 200);
  assert.equal(known.body.message, unknown.body.message, 'same answer either way');
  const code = outbox.find((m) => m.subject === 'sign-in code').code;

  const wrong = await api('POST', '/api/waitlist/login/verify', { email: u.email, code: code === '000000' ? '111111' : '000000' });
  assert.equal(wrong.status, 400);

  // A sign-in code is not accepted by the sign-up verification endpoint.
  assert.equal((await api('POST', '/api/waitlist/otp/verify', { identifier: u.email, purpose: 'login', code })).status, 400);

  const ok = await api('POST', '/api/waitlist/login/verify', { email: u.email, code });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.userId, u.id);
  assert.equal(ok.body.xaneTag, null);
  assert.equal(ok.body.premium.status, 'expired');
  assert.equal(ok.body.premium.tag, 'signin_me');
  assert.equal(ok.body.referralCount, 2);
  assert.equal(ok.body.referralLink, 'https://waitlist.test/waitlist?ref=signin_me');

  const reuse = await api('POST', '/api/waitlist/login/verify', { email: u.email, code });
  assert.equal(reuse.status, 400, 'a code works once');
});

test('competing claims: a released tag goes to the next claimant; old links still credit the old member', async () => {
  const first = await member({ premium: 'popular' });
  await endWindow(first);
  await challenge.processPremiumTagChallenges();

  await verifiedEmail('second@example.test');
  const second = await api('POST', '/api/waitlist/join', {
    fullName: 'Second Person',
    email: 'second@example.test',
    premiumXaneTag: 'popular',
  });
  assert.equal(second.status, 201, JSON.stringify(second.body));
  assert.equal(second.body.xaneTag, 'popular');
  const secondRow = await row(second.body.userId);
  assert.equal(secondRow.premium_xane_tag_requested, 'popular');
  assert.match(secondRow.referral_code, /^popular_[0-9a-f]{6}$/, 'newcomer gets a distinct code');
  assert.equal((await row(first.id)).referral_code, 'popular');

  // Now held again: no one else can take it, the original member included.
  assert.equal((await api('GET', '/api/waitlist/check-username?tag=popular&type=premium')).body.available, false);
  await verifiedEmail('third@example.test');
  const third = await api('POST', '/api/waitlist/join', { fullName: 'Third', email: 'third@example.test', premiumXaneTag: 'popular' });
  assert.equal(third.status, 409);

  // ?ref=popular still belongs to the member who shared it first.
  await verifiedEmail('fourth@example.test');
  const fourth = await api('POST', '/api/waitlist/join', {
    fullName: 'Fourth',
    email: 'fourth@example.test',
    xaneTag: 'fourth_1',
    referralCode: 'popular',
  });
  assert.equal(fourth.status, 201);
  assert.equal((await row(fourth.body.userId)).referred_by, first.id);

  // Referral preview never shows the released name for the old member.
  const preview = await api('GET', '/api/waitlist/referral-preview?ref=popular');
  assert.equal(preview.body.referrerTag, null);
  assert.equal(preview.body.referrerName, 'Member');
});

test('competing claims at the same moment: exactly one wins, across free and Premium', async () => {
  const emails = Array.from({ length: 6 }, (_, i) => `race${i}@example.test`);
  for (const e of emails) await verifiedEmail(e);
  const results = await Promise.all(
    emails.map((email, i) =>
      api('POST', '/api/waitlist/join', {
        fullName: `Racer ${i}`,
        email,
        ...(i % 2 ? { premiumXaneTag: 'race_tag_1' } : { xaneTag: 'race_tag_1' }),
      })
    )
  );
  const statuses = results.map((r) => r.status).sort();
  assert.deepEqual(statuses, [201, 409, 409, 409, 409, 409]);
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int n FROM waitlist_users WHERE 'race_tag_1' IN (xane_tag, premium_xane_tag_requested, premium_xane_tag)`
  );
  assert.equal(rows[0].n, 1);
});

test('leaderboard shows no released name', async () => {
  const u = await member({ premium: 'boardtag' });
  await referrals(u, 40);
  // Not secured because we expire it before it could be: force the 40 events outside the window.
  await pool.query(`UPDATE waitlist_users SET is_premium_tag_active = FALSE, premium_xane_tag = NULL WHERE id = $1`, [u.id]);
  await endWindow(u);
  await pool.query(`UPDATE referral_events SET created_at = NOW() WHERE referrer_id = $1`, [u.id]);
  await challenge.processPremiumTagChallenges();

  const board = await api('GET', '/api/leaderboard?limit=200');
  const names = board.body.leaderboard.map((e) => e.username);
  assert.ok(!names.includes('@boardtag'));
  assert.ok(!names.includes('@null'));
  assert.ok(names.includes('Xane member'));
});

test('release script logic preserves every member and referral count', async () => {
  const totals = async () =>
    (await pool.query(`SELECT COUNT(*)::int u, SUM(referral_count)::int r, COUNT(*) FILTER (WHERE is_premium_tag_active)::int s FROM waitlist_users`)).rows[0];
  const before = await totals();
  const u = await member({ premium: 'scripted' });
  await pool.query(`UPDATE waitlist_users SET premium_tag_expired_at = NOW(), premium_expiry_email_sent_at = NOW() WHERE id = $1`, [u.id]);

  const client = await pool.connect();
  await client.query('BEGIN');
  const released = await challenge.releaseExpiredReservations(client);
  await client.query('ROLLBACK');
  client.release();
  assert.ok(released.some((r) => r.id === u.id));
  assert.equal((await row(u.id)).premium_xane_tag_requested, 'scripted', 'rolled back');

  const after = await totals();
  assert.equal(after.u, before.u + 1);
  assert.equal(after.r, before.r);
  assert.equal(after.s, before.s);
});
