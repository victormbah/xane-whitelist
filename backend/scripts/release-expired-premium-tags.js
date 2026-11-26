// Frees the Premium XaneTags of reservations that have expired, and secures any reservation that
// reached 10 referrals inside its window but was never activated.
//
//   node scripts/release-expired-premium-tags.js              preview: runs it, prints, ROLLS BACK
//   APPLY=true node scripts/release-expired-premium-tags.js   does it
//
// The scheduler does the same thing every hour once this code is deployed; this script exists to
// see the effect first and to run it at a chosen moment. It sends no email. It changes only
// premium_xane_tag_requested (moved to premium_xane_tag_expired), premium_tag_expired_at (set if
// missing) and, for earned reservations, premium_xane_tag / is_premium_tag_active. Email,
// referral_code, referral_count, level and position are never touched.
require('dotenv').config();

const { pool } = require('../config/db');
const {
  activateEarnedReservations,
  releaseExpiredReservations,
} = require('../services/premiumTagChallengeService');

const APPLY = process.env.APPLY === 'true';

async function main() {
  const client = await pool.connect();
  try {
    const { rows: col } = await client.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_name = 'waitlist_users' AND column_name = 'premium_xane_tag_expired'`
    );
    if (col.length === 0) {
      throw new Error('Run migrations first (npm run migrate): premium_xane_tag_expired is missing.');
    }

    const snapshot = () =>
      client.query(
        `SELECT COUNT(*)::int AS users, COALESCE(SUM(referral_count), 0)::int AS referrals,
                COUNT(*) FILTER (WHERE is_premium_tag_active)::int AS secured
         FROM waitlist_users`
      );
    const before = (await snapshot()).rows[0];

    await client.query('BEGIN');
    const activated = await activateEarnedReservations(client);
    const released = await releaseExpiredReservations(client);
    const after = (await snapshot()).rows[0];

    console.log(`Secured (reached 10 in time, were not activated): ${activated.length}`);
    for (const r of activated) console.log(`  SECURE  @${r.premium_xane_tag}  ${r.id}`);
    console.log(`Released (expired reservations): ${released.length}`);
    for (const r of released) console.log(`  RELEASE @${r.premium_xane_tag_expired}  ${r.id}`);
    console.log(`Users ${before.users} -> ${after.users}, referrals ${before.referrals} -> ${after.referrals}, secured ${before.secured} -> ${after.secured}`);

    if (before.users !== after.users || before.referrals !== after.referrals || after.secured < before.secured) {
      throw new Error('Invariant broken (users, referrals or secured tags changed); rolled back.');
    }

    if (APPLY) {
      await client.query('COMMIT');
      console.log('APPLIED.');
    } else {
      await client.query('ROLLBACK');
      console.log('Preview only: rolled back. Run with APPLY=true to apply.');
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
