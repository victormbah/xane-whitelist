const { pool } = require('../config/db');
const { sendEmail } = require('../config/resend');
const { TEMPLATES, NEXT_GOAL_COPY } = require('./emailTemplates');

const FRONTEND_URL =
  process.env.FRONTEND_URL || 'https://www.xane.app';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);
}

function getReferralLink(user) {
  return user.referral_code
    ? `${FRONTEND_URL}/waitlist?ref=${encodeURIComponent(user.referral_code)}`
    : `${FRONTEND_URL}/waitlist`;
}

function premiumEmailTemplate({ tag, title, message, buttonText, referralLink }) {
  const safeTag = escapeHtml(tag);
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message).replace(/\n/g, '<br>');
  const safeButtonText = escapeHtml(buttonText);
  const safeLink = escapeHtml(referralLink);

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin:0;padding:0;background:#f3f5fa;font-family:Arial,Helvetica,sans-serif;color:#111827;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f5fa;padding:32px 12px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;">
                <tr>
                  <td style="background:#10172a;padding:28px 32px;">
                    <div style="font-size:25px;font-weight:800;letter-spacing:3px;color:#ffffff;">XANE</div>
                    <div style="margin-top:8px;font-size:12px;letter-spacing:2px;color:#a8b7d9;">YOUR NAME. YOUR PLACE.</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:32px;">
                    <div style="display:inline-block;background:#e9efff;color:#244fd6;border-radius:20px;padding:7px 12px;font-size:12px;font-weight:700;">
                      PREMIUM XANETAG
                    </div>
                    <h1 style="font-size:26px;line-height:1.3;margin:20px 0 16px;color:#10172a;">
                      ${safeTitle}
                    </h1>
                    <p style="font-size:15px;line-height:1.8;color:#374151;margin:0 0 22px;">
                      ${safeMessage}
                    </p>
                    <div style="background:#f3f6ff;border:1px solid #dce5ff;border-radius:12px;padding:18px;margin:24px 0;">
                      <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:1px;">
                        Your requested XaneTag
                      </div>
                      <div style="font-size:26px;font-weight:800;color:#244fd6;margin-top:8px;">
                        @${safeTag}
                      </div>
                    </div>
                    <p style="font-size:15px;line-height:1.8;color:#374151;">
                      Your target is <strong>10 successful referrals within 14 days</strong>.
                      Your referral link is ready to share.
                    </p>
                    <div style="text-align:center;margin:28px 0;">
                      <a href="${safeLink}" style="display:inline-block;background:#315cf5;color:#ffffff;text-decoration:none;padding:15px 25px;border-radius:9px;font-weight:700;font-size:14px;">
                        ${safeButtonText}
                      </a>
                    </div>
                    <p style="font-size:13px;line-height:1.7;color:#64748b;word-break:break-word;">
                      If the button doesn't work, copy this link:<br>
                      <a href="${safeLink}" style="color:#315cf5;">${safeLink}</a>
                    </p>
                    <p style="font-size:14px;line-height:1.8;color:#374151;margin-top:28px;">
                      Keep sharing. Your referrals bring you closer to becoming a Xane Advocate.
                    </p>
                    <p style="font-size:14px;line-height:1.8;color:#374151;">
                      Team Xane
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="background:#f8fafc;padding:20px 32px;font-size:12px;line-height:1.7;color:#94a3b8;">
                    You're receiving this email because you requested a Premium XaneTag on Xane.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

async function sendPremiumReservationEmail({ userId }) {
  const { rows } = await pool.query(
    `SELECT * FROM waitlist_users WHERE id = $1`,
    [userId]
  );

  const user = rows[0];

  if (
    !user ||
    !user.premium_xane_tag_requested ||
    user.is_premium_tag_active ||
    user.premium_tag_expired_at
  ) {
    return;
  }

  const referralLink = getReferralLink(user);

  await sendEmail({
    toEmail: user.email,
    subject: `Your Premium XaneTag @${user.premium_xane_tag_requested} is reserved`,
    html: premiumEmailTemplate({
      tag: user.premium_xane_tag_requested,
      title: 'Your Premium XaneTag journey starts now.',
      message:
        `Your requested name is temporarily reserved for you. ` +
        `Refer 10 people within 14 days to become a Xane Advocate and secure your Premium XaneTag.`,
      buttonText: 'Complete Your Referrals',
      referralLink,
    }),
  });
}

async function sendPremiumDay7Reminder({ userId }) {
  const { rows } = await pool.query(
    `SELECT * FROM waitlist_users WHERE id = $1`,
    [userId]
  );

  const user = rows[0];

  if (
    !user ||
    !user.premium_xane_tag_requested ||
    user.is_premium_tag_active ||
    user.premium_tag_expired_at ||
    Number(user.referral_count) >= 10 ||
    !user.premium_xane_tag_deadline
  ) {
    return;
  }

  const referralLink = getReferralLink(user);
  const referralsNeeded = Math.max(0, 10 - Number(user.referral_count || 0));

  await sendEmail({
    toEmail: user.email,
    subject: `7 days left to secure @${user.premium_xane_tag_requested}`,
    html: premiumEmailTemplate({
      tag: user.premium_xane_tag_requested,
      title: 'Your Premium XaneTag is still waiting for you.',
      message:
        `Your name is reserved, but you haven't secured it yet.\n\n` +
        `Refer 10 people to secure your Premium XaneTag, become a Xane Advocate and keep your early waitlist benefits.\n\n` +
        `${referralsNeeded} more successful referral${referralsNeeded === 1 ? '' : 's'} needed. There are 7 days left in your challenge.`,
      buttonText: 'Complete Your Referrals',
      referralLink,
    }),
  });
}

async function sendPremiumExpiryEmail({ userId, tag }) {
  const { rows } = await pool.query(
    `SELECT *
     FROM waitlist_users
     WHERE id = $1
       AND premium_tag_expired_at IS NOT NULL
       AND is_premium_tag_active = FALSE
       AND premium_expiry_email_sent_at IS NULL`,
    [userId]
  );

  const user = rows[0];

  if (!user || !tag) {
    return false;
  }

  const referralLink = getReferralLink(user);

  await sendEmail({
    toEmail: user.email,
    subject: `Your reservation for @${tag} has expired`,
    html: premiumEmailTemplate({
      tag,
      title: 'Your 14-day reservation has ended.',
      message:
        `Your 14 days are up, and you did not meet the 10-referral target.\n\n` +
        `Your reservation for @${tag} has expired. This name may no longer be available.\n\n` +
        `You can claim an available XaneTag at public launch, subject to availability. Stay connected for what's next.`,
      buttonText: 'Visit Xane',
      referralLink: FRONTEND_URL,
    }),
  });

  await pool.query(
    `UPDATE waitlist_users
     SET premium_expiry_email_sent_at = NOW()
     WHERE id = $1
       AND premium_tag_expired_at IS NOT NULL
       AND premium_expiry_email_sent_at IS NULL`,
    [userId]
  );

  return true;
}

/**
 * Existing milestone email functionality.
 */
async function sendLevelUpEmail({ userId, level }) {
  const { rows } = await pool.query(
    `SELECT * FROM waitlist_users WHERE id = $1`,
    [userId]
  );

  const user = rows[0];

  if (!user) return;

  const template = TEMPLATES[level];

  if (!template) return;

  const activeTag =
    user.is_premium_tag_active && user.premium_xane_tag
      ? user.premium_xane_tag
      : user.xane_tag || user.premium_xane_tag_requested;

  const { subject, html } = template({
    tag: activeTag,
    position: user.position,
    nextGoal: NEXT_GOAL_COPY[level],
  });

  const referralLink = getReferralLink(user);

  const finalHtml = html
    .replaceAll('{{referralLink}}', referralLink)
    .replaceAll('{{leaderboardLink}}', `${FRONTEND_URL}/leaderboard`);

  const existing = await pool.query(
    `SELECT 1
     FROM level_up_emails_sent
     WHERE user_id = $1 AND level = $2
     LIMIT 1`,
    [userId, level]
  );

  if (existing.rowCount > 0) return;

  await sendEmail({
    toEmail: user.email,
    subject,
    html: finalHtml,
  });

  try {
    await pool.query(
      `INSERT INTO level_up_emails_sent (user_id, level)
       VALUES ($1, $2)
       ON CONFLICT (user_id, level) DO NOTHING`,
      [userId, level]
    );
  } catch (err) {
    console.error('Failed to record level-up email:', err.message);
  }
}

module.exports = {
  sendLevelUpEmail,
  sendPremiumReservationEmail,
  sendPremiumDay7Reminder,
  sendPremiumExpiryEmail,
};