// Read-only export of the XaneTags waitlist members keep, for the waitlist -> wallet migration.
//
//   node scripts/export-tags-for-wallet.js <out.csv>     writes the CSV (it contains emails)
//   node scripts/export-tags-for-wallet.js               prints a summary only, no emails
//
// One row per member who holds a tag the wallet must keep for them:
//   premium_secured  a Premium tag earned with 10 referrals in 14 days
//   free             the free tag chosen at sign-up
// Members whose reservation expired, or is still running, hold nothing to carry over: at launch
// they claim any available tag (their old one included, if still free) under the wallet's rules.
// A running reservation is listed separately so it is not lost if the export runs before it ends.
//
// wallet_ok says whether the tag passes the wallet's rule (xane-backend-local src/utils/tag.ts:
// 3-15 characters of a-z 0-9 _ .). Waitlist tags may be up to 20 characters.
require('dotenv').config();

const fs = require('fs');
const { pool } = require('../config/db');

const WALLET_TAG_REGEX = /^[a-z0-9_.]{3,15}$/;

function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  const out = process.argv[2];
  const client = await pool.connect();
  try {
    await client.query('BEGIN TRANSACTION READ ONLY');
    const { rows } = await client.query(
      `SELECT id, LOWER(TRIM(email)) AS email, status, referral_count, level,
              CASE
                WHEN is_premium_tag_active AND premium_xane_tag IS NOT NULL THEN premium_xane_tag
                WHEN xane_tag IS NOT NULL THEN xane_tag
                WHEN premium_tag_expired_at IS NULL THEN premium_xane_tag_requested
              END AS tag,
              CASE
                WHEN is_premium_tag_active AND premium_xane_tag IS NOT NULL THEN 'premium_secured'
                WHEN xane_tag IS NOT NULL THEN 'free'
                WHEN premium_tag_expired_at IS NULL AND premium_xane_tag_requested IS NOT NULL
                  THEN 'premium_reservation_running'
              END AS kind
       FROM waitlist_users
       ORDER BY created_at`
    );
    await client.query('ROLLBACK');

    const kept = rows.filter((r) => r.tag);
    const summary = {};
    for (const r of kept) {
      const ok = WALLET_TAG_REGEX.test(r.tag);
      const key = `${r.kind}${ok ? '' : ' (not valid in wallet)'}`;
      summary[key] = (summary[key] || 0) + 1;
    }
    console.log(`Members: ${rows.length}; holding a tag: ${kept.length}; holding none: ${rows.length - kept.length}`);
    console.table(summary);

    if (out) {
      const header = ['waitlist_id', 'email', 'tag', 'kind', 'wallet_ok', 'status', 'referral_count', 'level'];
      const lines = [header.join(',')].concat(
        kept.map((r) =>
          [r.id, r.email, r.tag, r.kind, WALLET_TAG_REGEX.test(r.tag), r.status, r.referral_count, r.level]
            .map(csvCell)
            .join(',')
        )
      );
      fs.writeFileSync(out, lines.join('\n') + '\n');
      console.log(`Wrote ${kept.length} rows to ${out}`);
    }
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
