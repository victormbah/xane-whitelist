const axios = require('axios');

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!token) {
  throw new Error('TELEGRAM_BOT_TOKEN is missing');
}

if (!secret) {
  throw new Error('TELEGRAM_WEBHOOK_SECRET is missing');
}

const webhookUrl = 'https://xane-whitelist.onrender.com/api/telegram/webhook';

async function main() {
  const response = await axios.post(
    `https://api.telegram.org/bot${token}/setWebhook`,
    {
      url: webhookUrl,
      secret_token: secret,
      allowed_updates: ['message', 'chat_member'],
    }
  );

  console.log(response.data);
}

main().catch((error) => {
  console.error(
    error.response?.data || error.message
  );
  process.exit(1);
});
