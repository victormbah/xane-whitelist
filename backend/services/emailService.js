const { pool } = require('../config/db');
const { sendEmail } = require('../config/resend');
const {
  TEMPLATES,
  NEXT_GOAL_COPY,
  buildShareLinks,
} = require('./emailTemplates');

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

/**
 * Replaces referral placeholders with safely escaped, user-specific links.
 */
function injectReferralLinks(html, referralLink) {
  const shareLinks = buildShareLinks(referralLink);

  return html
    .replaceAll(
      '{{referralLink}}',
      escapeHtml(referralLink)
    )
    .replaceAll(
      '{{whatsappShareLink}}',
      escapeHtml(shareLinks.whatsapp)
    )
    .replaceAll(
      '{{telegramShareLink}}',
      escapeHtml(shareLinks.telegram)
    )
    .replaceAll(
      '{{leaderboardLink}}',
      escapeHtml(`${FRONTEND_URL}/leaderboard`)
    );
}

/**
 * Premium XaneTag email template.
 * Uses the same light-blue branding as the waitlist emails.
 * No slogan is displayed in the header.
 */
function premiumEmailTemplate({
  tag,
  title,
  message,
  referralLink,
}) {
  const safeTag = escapeHtml(tag);
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message).replace(/\n/g, '<br>');
  const safeLink = escapeHtml(referralLink);

  const shareLinks = buildShareLinks(referralLink);
  const safeWhatsapp = escapeHtml(shareLinks.whatsapp);
  const safeTelegram = escapeHtml(shareLinks.telegram);

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta name="color-scheme" content="light">
        <meta name="supported-color-schemes" content="light">
        <title>${safeTitle}</title>
      </head>

      <body style="margin:0;padding:0;background:#f3f5fa;font-family:Arial,Helvetica,sans-serif;color:#111827;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f3f5fa;padding:32px 12px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;">

                <!-- Light-blue XANE header -->
                <tr>
                  <td style="background:#245cff;padding:28px 32px;">
                    <div style="font-size:25px;font-weight:800;letter-spacing:3px;color:#ffffff;">
                      XANE<span style="color:#dce7ff;">.</span>
                    </div>
                  </td>
                </tr>

                <!-- Email content -->
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

                    <!-- Reserved XaneTag -->
                    <div style="background:#f3f6ff;border:1px solid #dce5ff;border-radius:12px;padding:18px;margin:24px 0;">
                      <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:1px;">
                        Your requested XaneTag
                      </div>

                      <div style="font-size:26px;font-weight:800;color:#244fd6;margin-top:8px;overflow-wrap:anywhere;">
                        @${safeTag}
                      </div>
                    </div>

                    <p style="font-size:15px;line-height:1.8;color:#374151;">
                      Your target is <strong>10 successful referrals within 14 days</strong>.
                      Share your personal referral link to help secure your Premium XaneTag.
                    </p>

                    <!-- Share referral link -->
                    <div style="margin:28px 0;padding:20px;background:#f3f6ff;border:1px solid #dce5ff;border-radius:12px;">

                      <p style="font-size:14px;font-weight:700;color:#10172a;margin:0 0 12px;">
                        Share your referral link
                      </p>

                      <p style="font-size:13px;line-height:1.8;color:#64748b;margin:0 0 16px;">
                        Choose where you want to share your link.
                      </p>

                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                        <tr>
                          <td align="center" bgcolor="#245cff" style="background:#245cff;border-radius:10px;">
                            <a href="${safeWhatsapp}" target="_blank" style="display:block;padding:15px 12px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">
                              Share on WhatsApp
                            </a>
                          </td>
                        </tr>

                        <tr>
                          <td height="10" style="font-size:0;line-height:0;">&nbsp;</td>
                        </tr>

                        <tr>
                          <td align="center" style="background:#ffffff;border:2px solid #245cff;border-radius:10px;">
                            <a href="${safeTelegram}" target="_blank" style="display:block;padding:13px 12px;font-size:14px;font-weight:700;color:#245cff;text-decoration:none;border-radius:10px;">
                              Share on Telegram
                            </a>
                          </td>
                        </tr>
                      </table>

                      <p style="font-size:12px;line-height:1.8;color:#64748b;margin:18px 0 8px;">
                        Your personal referral URL:
                      </p>

                      <div style="background:#ffffff;border:1px solid #dce5ff;border-radius:8px;padding:13px;font-size:13px;line-height:1.8;overflow-wrap:anywhere;word-break:break-word;">
                        <a href="${safeLink}" style="color:#245cff;text-decoration:none;">
                          ${safeLink}
                        </a>
                      </div>

                      <p style="font-size:12px;line-height:1.7;color:#64748b;margin:10px 0 0;">
                        You can select and copy this link to share it anywhere.
                      </p>
                    </div>

                    <p style="font-size:14px;line-height:1.8;color:#374151;margin-top:28px;">
                      Keep sharing. Your referrals bring you closer to becoming a Xane Advocate.
                    </p>

                    <p style="font-size:14px;line-height:1.8;color:#374151;">
                      Team Xane
                    </p>

                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="background:#f8fafc;padding:20px 32px;font-size:12px;line-height:1.7;color:#94a3b8;">
                    You're receiving this email because you requested a Premium XaneTag on Xane.
                    <br><br>
                    <a href="${escapeHtml(FRONTEND_URL)}" style="color:#245cff;text-decoration:none;">
                      Visit Xane
                    </a>
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

/**
 * Premium XaneTag reservation email.
 */
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
        'Your requested name is temporarily reserved for you. ' +
        'Refer 10 people within 14 days to become a Xane Advocate and secure your Premium XaneTag.',
      referralLink,
    }),
  });
}

/**
 * Premium XaneTag day-seven reminder.
 */
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
  const referralsNeeded = Math.max(
    0,
    10 - Number(user.referral_count || 0)
  );

  await sendEmail({
    toEmail: user.email,
    subject: `7 days left to secure @${user.premium_xane_tag_requested}`,
    html: premiumEmailTemplate({
      tag: user.premium_xane_tag_requested,
      title: 'Your Premium XaneTag is still waiting for you.',
      message:
        "Your name is reserved, but you haven't secured it yet.\n\n" +
        'Refer 10 people to secure your Premium XaneTag, become a Xane Advocate and keep your early waitlist benefits.\n\n' +
        `${referralsNeeded} more successful referral${referralsNeeded === 1 ? '' : 's'} needed. There are 7 days left in your challenge.`,
      referralLink,
    }),
  });
}

/**
 * Premium XaneTag expiry email.
 */
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

  await sendEmail({
    toEmail: user.email,
    subject: `Your reservation for @${tag} has expired`,
    html: premiumEmailTemplate({
      tag,
      title: 'Your 14-day reservation has ended.',
      message:
        'Your 14 days are up, and you did not meet the 10-referral target.\n\n' +
        `Your reservation for @${tag} has expired. This name may no longer be available.\n\n` +
        'You can claim an available XaneTag at public launch, subject to availability.',
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

  if (!user) {
    return;
  }

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

  const referralLink = getReferralLink(user);
  const finalHtml = injectReferralLinks(html, referralLink);

  const existing = await pool.query(
    `SELECT 1
     FROM level_up_emails_sent
     WHERE user_id = $1 AND level = $2
     LIMIT 1`,
    [userId, level]
  );

  if (existing.rowCount > 0) {
    return;
  }

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
    console.error(
      'Failed to record level-up email:',
      err.message
    );
  }
}

module.exports = {
  sendLevelUpEmail,
  sendPremiumReservationEmail,
  sendPremiumDay7Reminder,
  sendPremiumExpiryEmail,
};
