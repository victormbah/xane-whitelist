const FRONTEND_URL =
  process.env.FRONTEND_URL || 'https://www.xane.app';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatPosition(position) {
  const numericPosition = Number(position);

  if (!Number.isFinite(numericPosition) || numericPosition < 1) {
    return 'Pending';
  }

  return `#${numericPosition.toLocaleString('en-US')}`;
}

function emailLayout({
  preheader,
  eyebrow = 'THE XANE COMMUNITY',
  title,
  subtitle,
  tag,
  position,
  body,
  referralButton = true,
  footerNote = 'You are receiving this email because you joined the Xane waitlist.',
}) {
  const safeTag = escapeHtml(tag || 'your tag');
  const safePosition = escapeHtml(formatPosition(position));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${escapeHtml(title)}</title>
</head>

<body style="margin:0;padding:0;background-color:#f3f5fa;font-family:Arial,Helvetica,sans-serif;color:#172033;">

  <div style="display:none;font-size:1px;color:#f3f5fa;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    ${escapeHtml(preheader)}
    &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>

  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f3f5fa;">
    <tr>
      <td align="center" style="padding:28px 12px 36px;">

        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background-color:#ffffff;border-radius:20px;overflow:hidden;">

          <!-- Brand header -->
          <tr>
            <td style="background-color:#0b1020;padding:30px 30px 34px;">

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td align="left" style="font-size:25px;font-weight:800;letter-spacing:-1px;color:#ffffff;">
                    XANE<span style="color:#4b83ff;">.</span>
                  </td>
                  <td align="right" style="font-size:10px;font-weight:700;letter-spacing:1.5px;color:#b6c4e4;">
                    BUILT FOR WHAT'S NEXT
                  </td>
                </tr>
              </table>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:38px;">
                <tr>
                  <td style="background-color:#19294b;border:1px solid #304b7c;border-radius:20px;padding:7px 12px;font-size:10px;font-weight:700;letter-spacing:1.5px;color:#9fc0ff;">
                    ${escapeHtml(eyebrow)}
                  </td>
                </tr>
              </table>

              <h1 style="margin:20px 0 12px;font-size:34px;line-height:1.15;letter-spacing:-1.2px;color:#ffffff;font-weight:800;">
                ${escapeHtml(title)}
              </h1>

              <p style="margin:0;font-size:15px;line-height:1.8;color:#bdc8df;">
                ${escapeHtml(subtitle)}
              </p>

            </td>
          </tr>

          <!-- Main content -->
          <tr>
            <td style="padding:28px 30px 12px;">

              <!-- XaneTag card -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f4f7ff;border:1px solid #dce6ff;border-radius:15px;">
                <tr>
                  <td style="padding:22px;">

                    <p style="margin:0 0 9px;font-size:10px;font-weight:700;letter-spacing:1.5px;color:#63718b;">
                      YOUR XANETAG
                    </p>

                    <p style="margin:0;font-size:29px;line-height:1.3;font-weight:800;letter-spacing:-0.8px;color:#1749c8;overflow-wrap:anywhere;">
                      @${safeTag}
                    </p>

                    <p style="margin:10px 0 0;font-size:12px;line-height:1.7;color:#56647c;">
                      Your identity on Xane. Keep it close.
                    </p>

                  </td>
                </tr>
              </table>

              <!-- Waitlist position -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:16px;background-color:#ffffff;border:1px solid #e5e9f2;border-radius:15px;">
                <tr>
                  <td width="50%" valign="top" style="padding:19px 16px;">
                    <p style="margin:0 0 8px;font-size:10px;font-weight:700;letter-spacing:1px;color:#77839a;">
                      WAITLIST POSITION
                    </p>
                    <p style="margin:0;font-size:29px;font-weight:800;letter-spacing:-1px;color:#172033;">
                      ${safePosition}
                    </p>
                  </td>

                  <td width="50%" valign="top" style="padding:19px 16px;border-left:1px solid #e5e9f2;">
                    <p style="margin:0 0 8px;font-size:10px;font-weight:700;letter-spacing:1px;color:#77839a;">
                      YOUR NEXT MILESTONE
                    </p>
                    <p style="margin:0;font-size:14px;line-height:1.6;font-weight:700;color:#1749c8;">
                      ${escapeHtml(eyebrow === 'MILESTONE UNLOCKED' ? 'Keep climbing' : 'Refer. Rise. Repeat.')}
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Email-specific content -->
              <div style="padding-top:25px;font-size:14px;line-height:1.9;color:#48546a;">
                ${body}
              </div>

              ${
                referralButton
                  ? `
              <!-- Referral CTA -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:25px;">
                <tr>
                  <td align="center" bgcolor="#245cff" style="border-radius:10px;">
                    <a href="{{referralLink}}" target="_blank" style="display:block;padding:16px 20px;font-size:14px;line-height:1.4;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">
                      Share your referral link &nbsp; &#8594;
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:12px 0 0;text-align:center;font-size:11px;line-height:1.8;color:#8490a4;">
                Your personal link is always available through your Xane waitlist account.
              </p>
              `
                  : ''
              }

              <!-- Community link -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:27px;">
                <tr>
                  <td style="border-top:1px solid #e9edf4;padding-top:22px;">
                    <p style="margin:0;font-size:13px;line-height:1.8;color:#59667b;">
                      Want to see what's next?
                      <a href="{{leaderboardLink}}" target="_blank" style="color:#245cff;font-weight:700;text-decoration:underline;">
                        Explore your progress
                      </a>.
                    </p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:22px 30px 28px;background-color:#f8f9fc;">

              <p style="margin:0 0 10px;font-size:13px;font-weight:800;letter-spacing:-0.2px;color:#172033;">
                XANE<span style="color:#245cff;">.</span>
              </p>

              <p style="margin:0;font-size:11px;line-height:1.8;color:#7d889c;">
                ${escapeHtml(footerNote)}
              </p>

              <p style="margin:14px 0 0;font-size:11px;color:#7d889c;">
                <a href="${escapeHtml(FRONTEND_URL)}" target="_blank" style="color:#59667b;text-decoration:underline;">Visit Xane</a>
                &nbsp;&nbsp;·&nbsp;&nbsp;
                <a href="{{leaderboardLink}}" target="_blank" style="color:#59667b;text-decoration:underline;">Waitlist progress</a>
              </p>

              <p style="margin:17px 0 0;font-size:10px;line-height:1.7;color:#a0a9b8;">
                &copy; ${new Date().getFullYear()} Xane. All rights reserved.
              </p>

            </td>
          </tr>

        </table>

        <p style="max-width:540px;margin:18px 10px 0;font-size:10px;line-height:1.8;text-align:center;color:#8993a5;">
          Your next chapter starts here.
        </p>

      </td>
    </tr>
  </table>

</body>
</html>`;
}

const TEMPLATES = {
  waitlist_member: ({ tag, position }) => ({
    subject: `@${tag} is yours`,
    html: emailLayout({
      preheader: `Your XaneTag @${tag} is reserved. Here's your place on the waitlist.`,
      eyebrow: 'WELCOME TO XANE',
      title: `@${tag} is yours.`,
      subtitle: 'You made it onto the list. Now let’s move you up.',
      tag,
      position,
      body: `
        <p style="margin:0 0 16px;">Hey there,</p>

        <p style="margin:0 0 16px;">
          Your XaneTag is reserved. Nobody else can take it while it remains reserved under our current rules.
        </p>

        <p style="margin:0 0 16px;">
          The first 100 people on the waitlist get rewards when Xane launches. Every referral helps you move up, and three successful referrals make you a <strong style="color:#172033;">Xane Scout.</strong>
        </p>

        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0;background-color:#f4f7ff;border-radius:12px;">
          <tr>
            <td style="padding:17px;">
              <p style="margin:0 0 5px;font-size:11px;font-weight:700;letter-spacing:1px;color:#245cff;">
                YOUR FIRST MILESTONE
              </p>
              <p style="margin:0;font-size:14px;line-height:1.8;color:#26334b;">
                Invite 3 people to join Xane and unlock Scout status.
              </p>
            </td>
          </tr>
        </table>

        <p style="margin:0 0 10px;">Your journey starts now.</p>
      `,
    }),
  }),

  scout: ({ tag, position, nextGoal }) => ({
    subject: 'You’re a Xane Scout!',
    html: emailLayout({
      preheader: `You've reached Scout status. Here's your next milestone.`,
      eyebrow: 'MILESTONE UNLOCKED',
      title: 'You’re a Scout.',
      subtitle: 'Three referrals. One big step forward.',
      tag,
      position,
      body: `
        <p style="margin:0 0 16px;">You've brought three people into the Xane community. That's what makes you a <strong style="color:#172033;">Xane Scout.</strong></p>

        <p style="margin:0 0 16px;">You now get early Xane updates before everyone else.</p>

        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0;background-color:#f4f7ff;border-radius:12px;">
          <tr>
            <td style="padding:17px;">
              <p style="margin:0 0 5px;font-size:11px;font-weight:700;letter-spacing:1px;color:#245cff;">
                YOUR NEXT MILESTONE
              </p>
              <p style="margin:0;font-size:14px;line-height:1.8;color:#26334b;">
                ${escapeHtml(nextGoal || 'Keep sharing your link to reach the next level.')}
              </p>
            </td>
          </tr>
        </table>

        <p style="margin:0;">Keep building your community. You're just getting started.</p>
      `,
    }),
  }),

  advocate: ({ tag, position, nextGoal }) => ({
    subject: `You're a Xane Advocate, @${tag}`,
    html: emailLayout({
      preheader: `You've reached Advocate status on Xane.`,
      eyebrow: 'MILESTONE UNLOCKED',
      title: 'You’re an Advocate.',
      subtitle: 'Ten referrals. Your influence is growing.',
      tag,
      position,
      body: `
        <p style="margin:0 0 16px;">Ten people joined through you. You've earned your place as a <strong style="color:#172033;">Xane Advocate.</strong></p>

        <p style="margin:0 0 16px;">Your XaneTag is your identity in the community. If your Premium tag has been activated, this email reflects that active tag.</p>

        <p style="margin:0 0 16px;">You also get first look at Xane opportunities as they open.</p>

        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0;background-color:#f4f7ff;border-radius:12px;">
          <tr>
            <td style="padding:17px;">
              <p style="margin:0 0 5px;font-size:11px;font-weight:700;letter-spacing:1px;color:#245cff;">
                WHAT'S NEXT
              </p>
              <p style="margin:0;font-size:14px;line-height:1.8;color:#26334b;">
                ${escapeHtml(nextGoal || 'Keep sharing your link to reach the next level.')}
              </p>
            </td>
          </tr>
        </table>
      `,
    }),
  }),

  ambassador: ({ tag, position, nextGoal }) => ({
    subject: 'You’re a Xane Ambassador',
    html: emailLayout({
      preheader: `You've reached Ambassador status. Your community is growing.`,
      eyebrow: 'MILESTONE UNLOCKED',
      title: 'You’re an Ambassador.',
      subtitle: 'Thirty referrals. You’re building momentum.',
      tag,
      position,
      body: `
        <p style="margin:0 0 16px;">Thirty people have joined Xane through you. That's a serious community you've helped build.</p>

        <p style="margin:0 0 16px;">As a Xane Ambassador, you're eligible to host Xane campaigns and qualify for campaign incentives under the programme rules.</p>

        <p style="margin:0 0 16px;">If a team follow-up is part of your current campaign programme, we'll contact you with the relevant details.</p>

        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0;background-color:#f4f7ff;border-radius:12px;">
          <tr>
            <td style="padding:17px;">
              <p style="margin:0 0 5px;font-size:11px;font-weight:700;letter-spacing:1px;color:#245cff;">
                YOUR NEXT MILESTONE
              </p>
              <p style="margin:0;font-size:14px;line-height:1.8;color:#26334b;">
                ${escapeHtml(nextGoal || 'Keep growing your community.')}
              </p>
            </td>
          </tr>
        </table>
      `,
    }),
  }),

  lead: ({ tag, position }) => ({
    subject: 'You’re a Xane Lead',
    html: emailLayout({
      preheader: `You've reached Lead status on Xane.`,
      eyebrow: 'MILESTONE UNLOCKED',
      title: 'You’re a Xane Lead.',
      subtitle: 'Fifty referrals. You helped make this happen.',
      tag,
      position,
      body: `
        <p style="margin:0 0 16px;">Fifty people trusted your recommendation and joined Xane. That's a real milestone.</p>

        <p style="margin:0 0 16px;">As a Xane Lead, you may represent Xane in your city and receive opportunities to connect directly with the team, according to the programme rules.</p>

        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0;background-color:#f4f7ff;border-radius:12px;">
          <tr>
            <td style="padding:17px;">
              <p style="margin:0 0 5px;font-size:11px;font-weight:700;letter-spacing:1px;color:#245cff;">
                YOU HELPED BUILD THIS
              </p>
              <p style="margin:0;font-size:14px;line-height:1.8;color:#26334b;">
                You're not just on the waitlist. You're helping build the Xane community.
              </p>
            </td>
          </tr>
        </table>

        <p style="margin:0;">Thank you for being part of the journey.</p>
      `,
    }),
  }),
};

const NEXT_GOAL_COPY = {
  waitlist_member: 'Three referrals makes you a Xane Scout.',
  scout: "Seven more referrals and you're an Advocate.",
  advocate: 'Twenty more to Ambassador.',
  ambassador: 'Twenty more to Xane Lead.',
  lead: '',
};

module.exports = {
  TEMPLATES,
  NEXT_GOAL_COPY,
  formatPosition,
};