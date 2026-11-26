// The corrected expiry email, for members who got the original one (homepage link, tag not
// actually released).
//
//   node scripts/send-corrected-expiry-emails.js [outDir]   PREVIEW (default): sends nothing.
//        Lists how many members qualify and how many are not ready; with outDir, writes one HTML
//        file per member (they contain emails and links: keep them local).
//   SEND=true node scripts/send-corrected-expiry-emails.js  sends, once per member.
//
// A member qualifies only when their tag has really been released (premium_xane_tag_requested is
// NULL and premium_xane_tag_expired is set), i.e. after migration 004 and the release step. A
// member is claimed in premium_expiry_corrections BEFORE the send and unclaimed if it fails, so
// two runs at once, or a rerun, never email anyone twice.
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');
const { sendEmail } = require('../config/resend');
const { buildCorrectedExpiryEmail } = require('../services/emailService');

const SEND = process.env.SEND === 'true';
const PAUSE_MS = 600; // stay well inside the email provider's rate limit

async function main() {
  const outDir = process.argv[2];

  // Everyone who received the original expiry email.
  const { rows: all } = await pool.query(
    `SELECT u.*, (c.user_id IS NOT NULL) AS already_corrected
     FROM waitlist_users u
     LEFT JOIN premium_expiry_corrections c ON c.user_id = u.id
     WHERE u.premium_tag_expired_at IS NOT NULL
       AND u.premium_expiry_email_sent_at IS NOT NULL
       AND u.is_premium_tag_active = FALSE
     ORDER BY u.premium_tag_expired_at`
  );

  const notReleased = all.filter((u) => u.premium_xane_tag_requested || !u.premium_xane_tag_expired);
  const done = all.filter((u) => u.already_corrected);
  const ready = all.filter((u) => !u.already_corrected && !u.premium_xane_tag_requested && u.premium_xane_tag_expired);

  console.log(`Received the original expiry email: ${all.length}`);
  console.log(`  tag not released yet (will NOT be emailed): ${notReleased.length}`);
  console.log(`  already sent the correction:                ${done.length}`);
  console.log(`  ready to receive the correction:            ${ready.length}`);

  if (outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    for (const u of ready) {
      const { subject, html } = buildCorrectedExpiryEmail(u);
      fs.writeFileSync(path.join(outDir, `${u.id}.html`), `<!-- To: ${u.email} | Subject: ${subject} -->\n${html}`);
    }
    console.log(`Wrote ${ready.length} previews to ${outDir}`);
  }

  if (!SEND) {
    console.log('Preview only. Nothing was sent. Run with SEND=true to send.');
    return;
  }
  if (notReleased.length > 0) {
    console.log(`Note: ${notReleased.length} member(s) skipped because their tag is not released yet.`);
  }

  let sent = 0;
  for (const u of ready) {
    const claim = await pool.query(
      `INSERT INTO premium_expiry_corrections (user_id) VALUES ($1)
       ON CONFLICT (user_id) DO NOTHING RETURNING user_id`,
      [u.id]
    );
    if (claim.rowCount === 0) continue;

    try {
      const { subject, html } = buildCorrectedExpiryEmail(u);
      await sendEmail({ toEmail: u.email, subject, html });
      sent++;
      console.log(`SENT ${u.id}`);
    } catch (err) {
      await pool.query(`DELETE FROM premium_expiry_corrections WHERE user_id = $1`, [u.id]);
      console.error(`FAILED ${u.id}: ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, PAUSE_MS));
  }
  console.log(`Sent ${sent} of ${ready.length}.`);
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
