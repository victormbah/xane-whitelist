const { pool } = require('../config/db');
const { sendEmail } = require('../config/resend');
const {
  TEMPLATES,
  NEXT_GOAL_COPY,
  buildShareLinks,
} = require('./emailTemplates');
const { heldTag } = require('./tagService');

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
const CHALLENGE_NOTE =
  'Your target is <strong>10 successful referrals within 14 days</strong>. ' +
  'Share your personal referral link to help secure your Premium XaneTag.';

function premiumEmailTemplate({
  tag,
  title,
  message,
  referralLink,
  tagLabel = 'Your requested XaneTag',
  // Trusted HTML written in this file, never user input.
  noteHtml = CHALLENGE_NOTE,
  closingLine = 'Keep sharing. Your referrals bring you closer to becoming a Xane Advocate.',
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
                        ${escapeHtml(tagLabel)}
                      </div>

                      <div style="font-size:26px;font-weight:800;color:#244fd6;margin-top:8px;overflow-wrap:anywhere;">
                        @${safeTag}
                      </div>
                    </div>

                    <p style="font-size:15px;line-height:1.8;color:#374151;">
                      ${noteHtml}
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
                      ${escapeHtml(closingLine)}
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

    return true;
}

/**
 * Premium XaneTag expiry email.
 */
function buildPremiumExpiryEmail(user) {
  const tag = user.premium_xane_tag_expired || user.premium_xane_tag_requested;
  const count = Number(user.referral_count || 0);

  return {
    subject: `Your reservation for @${tag} has expired`,
    html: premiumEmailTemplate({
      tag,
      tagLabel: 'Your reservation has ended for',
      title: 'Your 14-day reservation has ended.',
      message:
        'Your 14 days are up, and you did not reach 10 successful referrals in time, ' +
        `so your reservation for @${tag} has expired and the name has been released.\n\n` +
        'You are still a member of the Xane waitlist. Your email stays registered, and your ' +
        `${count} referral${count === 1 ? '' : 's'}, your level and your place in line are all kept.\n\n` +
        'At public launch you can claim any available XaneTag, including ' +
        `@${tag} if no one else has claimed it by then.`,
      noteHtml:
        'Your personal referral link still works. Every successful referral keeps moving you ' +
        'up the waitlist and toward your next level.',
      closingLine: 'Keep sharing to climb the waitlist before launch.',
      referralLink: getReferralLink(user),
    }),
  };
}

/**
 * Correction for members who received the original expiry email, which linked to the homepage
 * instead of their referral link and said the name "may no longer be available" while it was in
 * fact still held. Only for members whose tag has really been released.
 */
function buildCorrectedExpiryEmail(user) {
  const tag = user.premium_xane_tag_expired;
  const count = Number(user.referral_count || 0);

  return {
    subject: `Correction: your Xane referral link and @${tag}`,
    html: premiumEmailTemplate({
      tag,
      tagLabel: 'Your reservation has ended for',
      title: 'A correction to our earlier email.',
      message:
        `Our earlier email about your @${tag} reservation linked to the Xane homepage instead of ` +
        'your personal referral link. Sorry about that: your own link is below.\n\n' +
        `Your 14-day reservation for @${tag} has ended and the name has now been released. ` +
        'You are still a member of the Xane waitlist: your email stays registered, and your ' +
        `${count} referral${count === 1 ? '' : 's'}, your level and your place in line are all kept.\n\n` +
        'At public launch you can claim any available XaneTag, including ' +
        `@${tag} if no one else has claimed it by then. You can sign in to your waitlist ` +
        'dashboard at any time with a code sent to this email address.',
      noteHtml:
        'Your personal referral link works now and keeps working. Every successful referral ' +
        'moves you up the waitlist and toward your next level.',
      closingLine: 'Thank you for being early. Keep sharing to climb before launch.',
      referralLink: getReferralLink(user),
    }),
  };
}

async function sendPremiumExpiryEmail({ userId }) {
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

  if (!user || !(user.premium_xane_tag_expired || user.premium_xane_tag_requested)) {
    return false;
  }

  const { subject, html } = buildPremiumExpiryEmail(user);

  await sendEmail({ toEmail: user.email, subject, html });

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
async function sendWelcomeEmail({ userId }) {
  const { rows } = await pool.query(
    'SELECT * FROM waitlist_users WHERE id = $1',
    [userId]
  );

  const user = rows[0];

  if (!user || !user.email) return;

  const template = TEMPLATES.waitlist_member;
  if (!template) {
    throw new Error('Missing waitlist_member email template');
  }

  const tag =
    user.is_premium_tag_active && user.premium_xane_tag
      ? user.premium_xane_tag
      : user.xane_tag || user.premium_xane_tag_requested || 'Xane member';

  const isPremiumReservation =
    Boolean(user.premium_xane_tag_requested) &&
    !user.is_premium_tag_active &&
    !user.premium_tag_expired_at;

  const { subject, html } = template({
    tag,
    position: user.position,
    nextGoal: NEXT_GOAL_COPY.waitlist_member,
  });

  const premiumReservationHtml = isPremiumReservation
    ? `
        <div style="margin-top:24px;padding:20px;border-radius:12px;background:#171717;color:#ffffff;">
          <h2 style="margin-top:0;">Your Premium XaneTag is reserved!</h2>
          <p>Your requested tag is <strong>@${user.premium_xane_tag_requested}</strong>.</p>
          <p>Refer 10 people within 14 days to become a Xane Advocate and secure your Premium XaneTag.</p>
          <p>Share your personal referral link below to get started.</p>
        </div>
      `
    : '';

  const finalHtml = html.replace(
    /(<\/body>)/i,
    `${premiumReservationHtml}$1`
  );

  await sendEmail({
    toEmail: user.email,
    subject: isPremiumReservation
      ? `Welcome to Xane — your Premium XaneTag @${user.premium_xane_tag_requested} is reserved`
      : subject,
    html: injectReferralLinks(finalHtml, getReferralLink(user)),
  });
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

  // A member whose reservation expired holds no tag until launch.
  const activeTag = heldTag(user);

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
  sendWelcomeEmail,
  sendLevelUpEmail,
  sendPremiumReservationEmail,
  sendPremiumDay7Reminder,
  sendPremiumExpiryEmail,
  buildPremiumExpiryEmail,
  buildCorrectedExpiryEmail,
  getReferralLink,
};
