const { Resend } = require('resend');

if (!process.env.RESEND_API_KEY) {
  throw new Error('RESEND_API_KEY is not configured');
}

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendEmail({ toEmail, subject, html }) {
  const { data, error } = await resend.emails.send({
    from: 'Xane <noreply@xane.app>',
    to: [toEmail],
    subject,
    html,
  });

  if (error) {
    console.error('Resend email error:', error);
    throw new Error(`Resend email failed: ${error.message}`);
  }

  console.log('Resend email sent:', data?.id);

  return data;
}

async function sendEmailOtp({
  email,
  code,
  expirationMinutes,
}) {
  return sendEmail({
    toEmail: email,
    subject: 'Your Xane verification code',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto;">
        <h2>Xane Email Verification</h2>

        <p>Your Xane verification code is:</p>

        <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; margin: 24px 0;">
          ${code}
        </div>

        <p>This code expires in ${expirationMinutes} minutes.</p>

        <p>
          If you didn't request this code, you can safely ignore this email.
        </p>
      </div>
    `,
  });
}

module.exports = {
  sendEmail,
  sendEmailOtp,
};