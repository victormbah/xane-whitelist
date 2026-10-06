const { pool } = require('../config/db');
const { sendEmail } = require('../config/resend');
const { TEMPLATES, NEXT_GOAL_COPY } = require('./emailTemplates');

const FRONTEND_URL =
  process.env.FRONTEND_URL || 'https://www.xane.app';

/**
 * Sends the milestone email for a given level.
 *
 * Each user receives a milestone email only once per level.
 *
 * The email always contains the user's personal referral link
 * so they can leave Xane and come back later without losing it.
 */
async function sendLevelUpEmail({ userId, level }) {
  const { rows } = await pool.query(
    `SELECT * FROM waitlist_users WHERE id = $1`,
    [userId]
  );

  const user = rows[0];

  if (!user) return;

  const template = TEMPLATES[level];

  if (!template) {
    return;
  }

  const activeTag =
    user.is_premium_tag_active && user.premium_xane_tag
      ? user.premium_xane_tag
      : user.xane_tag || user.premium_xane_tag_requested;

  const { subject, html } = template({
    tag: activeTag,
    position: user.position,
    nextGoal: NEXT_GOAL_COPY[level],
  });

  const referralLink = user.referral_code
    ? `${FRONTEND_URL}/waitlist?ref=${encodeURIComponent(
        user.referral_code
      )}`
    : `${FRONTEND_URL}/waitlist`;

  const finalHtml = html
    .replace(
      '{{referralLink}}',
      referralLink
    )
    .replace(
      '{{leaderboardLink}}',
      `${FRONTEND_URL}/leaderboard`
    );

  /*
   * Check whether this milestone email has already been sent.
   * We do this BEFORE sending so a failed email can be retried.
   */
  const existing = await pool.query(
    `SELECT 1
     FROM level_up_emails_sent
     WHERE user_id = $1
       AND level = $2
     LIMIT 1`,
    [userId, level]
  );

  if (existing.rowCount > 0) {
    return;
  }

  /*
   * Send the email through Resend.
   */
  await sendEmail({
    toEmail: user.email,
    subject,
    html: finalHtml,
  });

  /*
   * Only record the milestone AFTER Resend successfully accepts
   * the email.
   */
  try {
    await pool.query(
      `INSERT INTO level_up_emails_sent (user_id, level)
       VALUES ($1, $2)
       ON CONFLICT (user_id, level) DO NOTHING`,
      [userId, level]
    );
  } catch (err) {
    console.error(
      'Failed to record level-up email:',
      err.message
    );
  }
}

module.exports = {
  sendLevelUpEmail,
};