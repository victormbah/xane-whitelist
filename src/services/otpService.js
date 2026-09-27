const { pool } = require('../config/db');
const { sendVerification, confirmVerification } = require('../config/sendchamp');

const RESEND_COOLDOWN_SECONDS = 60;
const OTP_EXPIRY_MINUTES = 10;

/**
 * Send an OTP to a phone number or email address, respecting a resend
 * cooldown so the frontend's "Resend" countdown has something real behind it.
 */
async function requestOtp({ identifier, purpose }) {
  if (!['phone', 'email'].includes(purpose)) {
    throw badRequest('Invalid OTP purpose');
  }

  const { rows } = await pool.query(
    `SELECT * FROM otp_codes
     WHERE identifier = $1 AND purpose = $2
     ORDER BY created_at DESC LIMIT 1`,
    [identifier, purpose]
  );
  const last = rows[0];

  if (last) {
    const secondsSinceLastSend = (Date.now() - new Date(last.last_sent_at).getTime()) / 1000;
    if (secondsSinceLastSend < RESEND_COOLDOWN_SECONDS) {
      const retryAfter = Math.ceil(RESEND_COOLDOWN_SECONDS - secondsSinceLastSend);
      throw rateLimited(`Please wait ${retryAfter}s before requesting another code`, retryAfter);
    }
  }

  const channel = purpose === 'phone' ? 'sms' : 'email';
  const sendchampResponse = await sendVerification({
    channel,
    destination: identifier,
    expirationMinutes: OTP_EXPIRY_MINUTES,
  });

  const reference = sendchampResponse?.data?.verification_reference || sendchampResponse?.data?.reference;
  if (!reference) {
    throw new Error('Sendchamp did not return a verification reference');
  }

  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  await pool.query(
    `INSERT INTO otp_codes (identifier, purpose, sendchamp_reference, expires_at, last_sent_at)
     VALUES ($1, $2, $3, $4, now())`,
    [identifier, purpose, reference, expiresAt]
  );

  return { expiresInSeconds: OTP_EXPIRY_MINUTES * 60, resendAfterSeconds: RESEND_COOLDOWN_SECONDS };
}

/**
 * Confirm the code the user typed against the most recent OTP attempt for
 * that identifier/purpose pair.
 */
async function verifyOtp({ identifier, purpose, code }) {
  const { rows } = await pool.query(
    `SELECT * FROM otp_codes
     WHERE identifier = $1 AND purpose = $2 AND verified = FALSE
     ORDER BY created_at DESC LIMIT 1`,
    [identifier, purpose]
  );
  const attempt = rows[0];

  if (!attempt) {
    throw badRequest('No pending verification for this identifier. Request a new code.');
  }
  if (new Date(attempt.expires_at).getTime() < Date.now()) {
    throw badRequest('This code has expired. Request a new one.');
  }
  if (attempt.attempts >= attempt.max_attempts) {
    throw badRequest('Too many incorrect attempts. Request a new code.');
  }

  try {
    await confirmVerification({ reference: attempt.sendchamp_reference, code });
  } catch (err) {
    await pool.query(`UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1`, [attempt.id]);
    throw badRequest('Incorrect or expired code');
  }

  await pool.query(`UPDATE otp_codes SET verified = TRUE WHERE id = $1`, [attempt.id]);
  return { verified: true };
}

async function isVerified({ identifier, purpose }) {
  const { rows } = await pool.query(
    `SELECT 1 FROM otp_codes
     WHERE identifier = $1 AND purpose = $2 AND verified = TRUE
     ORDER BY created_at DESC LIMIT 1`,
    [identifier, purpose]
  );
  return rows.length > 0;
}

function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

function rateLimited(message, retryAfter) {
  const err = new Error(message);
  err.statusCode = 429;
  err.retryAfter = retryAfter;
  return err;
}

module.exports = { requestOtp, verifyOtp, isVerified };
