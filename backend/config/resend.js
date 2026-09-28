const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendEmailOtp({ email, code, expirationMinutes }) {
  const { data, error } = await resend.emails.send({
    from: 'Xane <noreply@xane.app>',
    to: [email],
    subject: 'Your Xane verification code',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto;">
        <h2>Xane Email Verification</h2>
        <p>Your Xane verification code is:</p>

        <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; margin: 24px 0;">
          ${code}
        </div>

        <p>This code expires in ${expirationMinutes} minutes.</p>
        <p>If you didn't request this code, you can safely ignore this email.</p>
      </div>
    `,
  });

  if (error) {
    throw new Error(`Resend email failed: ${error.message}`);
  }

  return data;
}

module.exports = { sendEmailOtp };