// Cross-system test server: the REAL waitlist backend, seeded through its own code, for the
// wallet's src/__tests__/postgres/waitlistEndToEnd.test.ts. Email is replaced by nothing.
//
//   TEST_DATABASE_URL=postgres://user@localhost:5432/waitlist_test E2E_SECRET=<32+ bytes> //     node test/e2e-wallet-server.js
//
// It REBUILDS the schema of TEST_DATABASE_URL, so it refuses anything but a local database.
// Serves the waitlist on :4099 and a test-only control port on :4098
// (POST /secure-running gives the running reservation 10 referrals; GET /totals).
const path = require('path');
const fs = require('fs');
const http = require('http');
const Module = require('module');
const BACKEND = path.join(__dirname, '..');

const TEST_DB = process.env.TEST_DATABASE_URL;
if (!TEST_DB || !['localhost', '127.0.0.1', '::1'].includes(new URL(TEST_DB).hostname)) {
  throw new Error('Set TEST_DATABASE_URL to a disposable LOCAL database; this script rebuilds its schema.');
}
if (!process.env.E2E_SECRET || process.env.E2E_SECRET.length < 32) throw new Error('Set E2E_SECRET (>= 32 chars).');
process.env.DATABASE_URL = TEST_DB;
process.env.DATABASE_SSL = 'false';
process.env.FRONTEND_URL = 'http://localhost:8099';
process.env.WAITLIST_SYNC_SECRET = process.env.E2E_SECRET;

const resendPath = require.resolve(path.join(BACKEND, 'config/resend'));
const fake = new Module(resendPath);
fake.filename = resendPath;
fake.loaded = true;
fake.exports = { sendEmail: async () => ({}), sendEmailOtp: async () => {} };
require.cache[resendPath] = fake;

const { pool } = require(path.join(BACKEND, 'config/db'));
const app = require(path.join(BACKEND, 'app'));
const challenge = require(path.join(BACKEND, 'services/premiumTagChallengeService'));
const referrals = require(path.join(BACKEND, 'services/referralService'));

let n = 0;
async function member({ email, free = null, premium = null, deadlineDays = 14, status = 'active' }) {
  n++;
  const { rows } = await pool.query(
    `INSERT INTO waitlist_users (full_name, phone_verified, email, email_verified, telegram_verified, xane_tag, referral_code,
       premium_xane_tag_requested, premium_xane_tag_deadline, status, base_position, position)
     VALUES ($1, TRUE, $2, TRUE, TRUE, $3, $4, $5, $6, $7, $8, $8) RETURNING id`,
    [`E2E ${n}`, email, free, free || premium, premium, premium ? new Date(Date.now() + deadlineDays * 86400000) : null, status, n]
  );
  return rows[0].id;
}
async function refer(referrerId, count) {
  for (let i = 0; i < count; i++) {
    const id = await member({ email: `friend${n + 1}@e2e.test`, free: `friend_e2e_${n + 1}` });
    await referrals.registerReferral({ referrerId, referredUserId: id });
  }
}

let runningId;
(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  const runJs = fs.readFileSync(path.join(BACKEND, 'migrations/run.js'), 'utf8');
  for (const f of runJs.match(/\d{3}_[a-z_]+\.sql/g)) await pool.query(fs.readFileSync(path.join(BACKEND, 'migrations', f), 'utf8'));

  const premium = await member({ email: 'Premium.Owner@E2E.test', premium: 'e2e_premium' });
  await refer(premium, 10); // secured by the real referral code
  await member({ email: 'free.owner@e2e.test', free: 'e2e_free_1' });
  const expired = await member({ email: 'expired.owner@e2e.test', premium: 'e2e_expired', deadlineDays: -1 });
  await refer(expired, 3);
  await member({ email: 'expired2.owner@e2e.test', premium: 'e2e_expired_two', deadlineDays: -1 });
  runningId = await member({ email: 'running.owner@e2e.test', premium: 'e2e_running', deadlineDays: 5 });
  await member({ email: 'long.owner@e2e.test', free: 'e2e_long_tag_twenty' }); // 19 chars
  await member({ email: 'pending.owner@e2e.test', free: 'e2e_pending_1', status: 'pending' });
  await challenge.processPremiumTagChallenges(); // releases the two expired reservations

  app.listen(4099, () => console.log('waitlist e2e on http://localhost:4099'));
  http
    .createServer(async (req, res) => {
      if (req.method === 'POST' && req.url === '/secure-running') {
        await refer(runningId, 10);
        res.end('ok');
      } else if (req.url === '/totals') {
        const { rows } = await pool.query(
          `SELECT COUNT(*)::int users, SUM(referral_count)::int referrals,
                  json_object_agg(LOWER(email), json_build_object('level', level, 'count', referral_count)) AS by_email
           FROM waitlist_users`
        );
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(rows[0]));
      } else {
        res.statusCode = 404;
        res.end();
      }
    })
    .listen(4098, () => console.log('control on http://localhost:4098'));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
