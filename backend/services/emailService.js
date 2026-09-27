const { pool } = require('../config/db');
const { sendchampClient } = require('../config/sendchamp');
const { TEMPLATES, NEXT_GOAL_COPY } = require('./emailTemplates');

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://xane.app';

// NOTE: confirm this path against your current Sendchamp dashboard/docs —
// transactional email send endpoints have moved before on some providers.
const EMAIL_SEND_PATH = '/email/send';

async function sendRawEmail({ toEmail, subject, html }) {
  await sendchampClient.post(EMAIL_SEND_PATH, {
    subject,
    sender: { email: 'hello@xane.app', name: 'Xane' },
    to: [{ email: toEmail }],
    message_body: { type: 'text/html', value: html },
  });
}

/**
 * Sends the milestone email for a given level, guarded so we never send the
 * same milestone twice to the same user (level_up_emails_sent has a unique
 * constraint on user_id + level).
 */
async function sendLevelUpEmail({ userId, level }) {
  const { rows } = await pool.query(`SELECT * FROM waitlist_users WHERE id = $1`, [userId]);
  const user = rows[0];
  if (!user) return;

  const template = TEMPLATES[level];
  if (!template) return; // 'captain' / 'founding_council' have no email copy yet

  const activeTag = user.is_premium_tag_active && user.premium_xane_tag ? user.premium_xane_tag : user.xane_tag;
  const { subject, html } = template({
    tag: activeTag,
    position: user.position,
    nextGoal: NEXT_GOAL_COPY[level],
  });

  const finalHtml = html
    .replace('{{referralLink}}', `${FRONTEND_URL}/join?ref=${user.referral_code}`)
    .replace('{{leaderboardLink}}', `${FRONTEND_URL}/leaderboard`);

  try {
    await pool.query(
      `INSERT INTO level_up_emails_sent (user_id, level) VALUES ($1, $2)`,
      [userId, level]
    );
  } catch (err) {
    if (err.code === '23505') return; // already sent, unique violation - skip silently
    throw err;
  }

  await sendRawEmail({ toEmail: user.email, subject, html: finalHtml });
}

module.exports = { sendLevelUpEmail, sendRawEmail };
