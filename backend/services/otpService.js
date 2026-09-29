const crypto = require('crypto');

const { pool } = require('../config/db');
const { sendVerification, confirmVerification } = require('../config/sendchamp');
const { sendEmailOtp } = require('../config/resend');

const RESEND_COOLDOWN_SECONDS = 60;
const OTP_EXPIRY_MINUTES = 10;

// Toggle phone OTP without removing Sendchamp.
// false = validate phone and mark it verified without SMS
// true  = use the normal Sendchamp SMS OTP flow
const PHONE_OTP_ENABLED =
  String(process.env.PHONE_OTP_ENABLED ?? 'true').toLowerCase() === 'true';

function hashOtp(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

function generateOtp() {
  return crypto.randomInt(100000, 1000000).toString();
}

function isValidNigeriaPhone(identifier) {
  const digits = String(identifier || '').replace(/\D/g, '');

  // Accept:
  // 8012345678
  // 2348012345678
  return /^(?:234)?[789]\d{9}$/.test(digits);
}

/**
 * Send an OTP to a phone number or email address.
 *
 * Phone:
 *   PHONE_OTP_ENABLED=true  -> Sendchamp SMS + Sendchamp verification
 *   PHONE_OTP_ENABLED=false -> validate phone and mark verified immediately
 *
 * Email:
 *   Locally generated OTP + Resend email
 */
async function requestOtp({ identifier, purpose }) {
  if (!['phone', 'email'].includes(purpose)) {
    throw badRequest('Invalid OTP purpose');
  }

  if (!identifier) {
    throw badRequest('Identifier is required');
  }

  // ---------------------------------------------------------------------------
  // TEMPORARY PHONE OTP BYPASS
  // ---------------------------------------------------------------------------
  if (purpose === 'phone' && !PHONE_OTP_ENABLED) {
    if (!isValidNigeriaPhone(identifier)) {
      throw badRequest('Enter a valid Nigerian phone number');
    }

    const expiresAt = new Date(
      Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000
    );

    // Keep a real OTP record so the normal verification infrastructure
    // remains compatible when Sendchamp is enabled later.
    await pool.query(
      `INSERT INTO otp_codes
       (identifier, purpose, sendchamp_reference, otp_code_hash, expires_at, last_sent_at, verified)
       VALUES ($1, $2, $3, $4, $5, now(), TRUE)`,
      [
        identifier,
        purpose,
        'phone_bypass',
        null,
        expiresAt,
      ]
    );

    return {
      verified: true,
      bypassed: true,
      expiresInSeconds: OTP_EXPIRY_MINUTES * 60,
      resendAfterSeconds: 0,
    };
  }

  // ---------------------------------------------------------------------------
  // EXISTING OTP COOLDOWN
  // ---------------------------------------------------------------------------
  const { rows } = await pool.query(
    `SELECT * FROM otp_codes
     WHERE identifier = $1 AND purpose = $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [identifier, purpose]
  );

  const last = rows[0];

  if (last) {
    const secondsSinceLastSend =
      (Date.now() - new Date(last.last_sent_at).getTime()) / 1000;

    if (secondsSinceLastSend < RESEND_COOLDOWN_SECONDS) {
      const retryAfter = Math.ceil(
        RESEND_COOLDOWN_SECONDS - secondsSinceLastSend
      );

      throw rateLimited(
        `Please wait ${retryAfter}s before requesting another code`,
        retryAfter
      );
    }
  }

  const expiresAt = new Date(
    Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000
  );

  // ---------------------------------------------------------------------------
  // PHONE -> SENDCHAMP
  // ---------------------------------------------------------------------------
  if (purpose === 'phone') {
    const sendchampResponse = await sendVerification({
      channel: 'sms',
      destination: identifier,
      expirationMinutes: OTP_EXPIRY_MINUTES,
    });

    const reference =
      sendchampResponse?.data?.verification_reference ||
      sendchampResponse?.data?.reference;

    if (!reference) {
      throw new Error('Sendchamp did not return a verification reference');
    }

    await pool.query(
      `INSERT INTO otp_codes
       (identifier, purpose, sendchamp_reference, expires_at, last_sent_at)
       VALUES ($1, $2, $3, $4, now())`,
      [identifier, purpose, reference, expiresAt]
    );
  }

  // ---------------------------------------------------------------------------
  // EMAIL -> RESEND
  // ---------------------------------------------------------------------------
  else {
    const code = generateOtp();
    const codeHash = hashOtp(code);

    await sendEmailOtp({
      email: identifier,
      code,
      expirationMinutes: OTP_EXPIRY_MINUTES,
    });

    await pool.query(
      `INSERT INTO otp_codes
       (identifier, purpose, sendchamp_reference, otp_code_hash, expires_at, last_sent_at)
       VALUES ($1, $2, $3, $4, $5, now())`,
      [identifier, purpose, 'resend', codeHash, expiresAt]
    );
  }

  return {
    expiresInSeconds: OTP_EXPIRY_MINUTES * 60,
    resendAfterSeconds: RESEND_COOLDOWN_SECONDS,
  };
}

/**
 * Confirm the code the user typed.
 *
 * Phone:
 *   Sendchamp when enabled.
 *   Bypass when disabled.
 *
 * Email:
 *   Locally verified against the hashed OTP sent by Resend.
 */
async function verifyOtp({ identifier, purpose, code }) {
  // When phone OTP is disabled, the request itself already verified it.
  if (purpose === 'phone' && !PHONE_OTP_ENABLED) {
    const verified = await isVerified({
      identifier,
      purpose,
    });

    if (!verified) {
      throw badRequest('Phone is not verified yet');
    }

    return {
      verified: true,
      bypassed: true,
    };
  }

  const { rows } = await pool.query(
    `SELECT * FROM otp_codes
     WHERE identifier = $1
       AND purpose = $2
       AND verified = FALSE
     ORDER BY created_at DESC
     LIMIT 1`,
    [identifier, purpose]
  );

  const attempt = rows[0];

  if (!attempt) {
    throw badRequest(
      'No pending verification for this identifier. Request a new code.'
    );
  }

  if (new Date(attempt.expires_at).getTime() < Date.now()) {
    throw badRequest('This code has expired. Request a new one.');
  }

  if (attempt.attempts >= attempt.max_attempts) {
    throw badRequest(
      'Too many incorrect attempts. Request a new code.'
    );
  }

  if (purpose === 'phone') {
    try {
      await confirmVerification({
        reference: attempt.sendchamp_reference,
        code,
      });
    } catch (err) {
      await pool.query(
        `UPDATE otp_codes
         SET attempts = attempts + 1
         WHERE id = $1`,
        [attempt.id]
      );

      throw badRequest('Incorrect or expired code');
    }
  } else {
    const submittedHash = hashOtp(code);

    if (
      !attempt.otp_code_hash ||
      submittedHash !== attempt.otp_code_hash
    ) {
      await pool.query(
        `UPDATE otp_codes
         SET attempts = attempts + 1
         WHERE id = $1`,
        [attempt.id]
      );

      throw badRequest('Incorrect or expired code');
    }
  }

  await pool.query(
    `UPDATE otp_codes
     SET verified = TRUE
     WHERE id = $1`,
    [attempt.id]
  );

  return { verified: true };
}

async function isVerified({ identifier, purpose }) {
  const { rows } = await pool.query(
    `SELECT 1 FROM otp_codes
     WHERE identifier = $1
       AND purpose = $2
       AND verified = TRUE
     ORDER BY created_at DESC
     LIMIT 1`,
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

module.exports = {
  requestOtp,
  verifyOtp,
  isVerified,
};