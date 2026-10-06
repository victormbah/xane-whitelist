const { pool } = require('../config/db');

const { sendchampClient } = require('../config/sendchamp');
const { TEMPLATES, NEXT_GOAL_COPY } = require('./emailTemplates');

const FRONTEND_URL =
  process.env.FRONTEND_URL || 'https://www.xane.app';

// Transactional email endpoint
const EMAIL_SEND_PATH = '/email/send';

async function sendRawEmail({ toEmail, subject, html }) {
  await sendchampClient.post(EMAIL_SEND_PATH, {
    subject,
    sender: {
      email: 'hello@xane.app',
      name: 'Xane',
    },
    to: [{ email: toEmail }],
    message_body: {
      type: 'text/html',
      value: html,
    },
  });
}

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

  try {
    await pool.query(
      `INSERT INTO level_up_emails_sent (user_id, level)
       VALUES ($1, $2)`,
      [userId, level]
    );
  } catch (err) {
    if (err.code === '23505') {
      return;
    }

    throw err;
  }

  await sendRawEmail({
    toEmail: user.email,
    subject,
    html: finalHtml,
  });
}

module.exports = {
  sendLevelUpEmail,
  sendRawEmail,
};