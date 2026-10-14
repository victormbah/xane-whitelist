
require('dotenv').config();

const { Pool } = require('pg');
const { sendWelcomeEmail } = require('../services/emailService');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.DATABASE_SSL === 'true'
      ? { rejectUnauthorized: false }
      : undefined,
});

const SEND_EMAILS = process.env.SEND_EMAILS === 'true';

async function main() {
  const { rows } = await pool.query(`
    SELECT u.id, u.email
    FROM waitlist_users u
    WHERE u.email_verified = true
      AND NOT EXISTS (
        SELECT 1
        FROM level_up_emails_sent e
        WHERE e.user_id = u.id
          AND e.level = 'waitlist_member'
      )
    ORDER BY u.created_at
  `);

  console.log(`Candidates: ${rows.length}`);
  console.log(`Sending enabled: ${SEND_EMAILS}`);

  if (!SEND_EMAILS) {
    for (const user of rows) console.log(`PREVIEW: ${user.email}`);
    console.log('Preview only. No emails sent.');
    return;
  }

  for (const user of rows) {
    // Claim the tracking row first to prevent concurrent recovery runs.
    const claim = await pool.query(
      `INSERT INTO level_up_emails_sent (user_id, level)
       VALUES ($1, 'waitlist_member')
       ON CONFLICT (user_id, level) DO NOTHING
       RETURNING user_id`,
      [user.id]
    );

    if (claim.rowCount === 0) {
      console.log(`SKIP (already tracked): ${user.email}`);
      continue;
    }

    try {
      await sendWelcomeEmail({ userId: user.id });
      console.log(`SENT: ${user.email}`);
    } catch (err) {
      // Remove the claim if sending failed, allowing a later retry.
      await pool.query(
        `DELETE FROM level_up_emails_sent
         WHERE user_id = $1 AND level = 'waitlist_member'`,
        [user.id]
      );
      console.error(`FAILED: ${user.email}: ${err.message}`);
    }
  }
}

main()
  .catch(err => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
