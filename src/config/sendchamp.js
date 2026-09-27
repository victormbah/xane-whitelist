const axios = require('axios');
const https = require('https');

const httpsAgent = new https.Agent({ family: 4, keepAlive: true });

const client = axios.create({
  baseURL: process.env.SENDCHAMP_BASE_URL || 'https://api.sendchamp.com/api/v1',
  httpsAgent,
  headers: {
    Authorization: `Bearer ${process.env.SENDCHAMP_API_KEY}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

/**
 * Ask Sendchamp to generate + deliver an OTP over SMS or email.
 * Returns Sendchamp's own verification_reference, which we don't rely on for
 * verifying the code (we do that ourselves against our own DB), but is
 * useful to keep around for support/debugging.
 */
async function sendVerification({ channel, destination, tokenLength = 6, expirationMinutes = 10 }) {
  const payload = {
    channel, // 'sms' | 'email'
    sender: process.env.SENDCHAMP_SENDER_NAME || 'Xane',
    token_type: 'numeric',
    token_length: tokenLength,
    expiration_time: expirationMinutes,
  };

  if (channel === 'sms') {
    payload.customer_mobile_number = destination;
  } else if (channel === 'email') {
    payload.customer_email_address = destination;
  }

  const { data } = await client.post('/verification/create', payload);
  return data;
}

/**
 * Confirm the code the user typed in against the Sendchamp reference for
 * this verification attempt.
 */
async function confirmVerification({ reference, code }) {
  const { data } = await client.post('/verification/confirm', {
    verification_reference: reference,
    verification_code: code,
  });
  return data;
}

module.exports = { sendchampClient: client, sendVerification, confirmVerification };
