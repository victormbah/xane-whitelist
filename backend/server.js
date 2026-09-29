require('dotenv').config();

const axios = require('axios');
const app = require('./app');

const PORT = process.env.PORT || 4000;

async function registerTelegramWebhook() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const externalUrl = process.env.RENDER_EXTERNAL_URL;

  if (!token || !secret || !externalUrl) {
    console.error('Telegram webhook not registered: missing environment variables');
    return;
  }

  const webhookUrl = `${externalUrl}/api/telegram/webhook`;

  try {
    const response = await axios.post(
      `https://api.telegram.org/bot${token}/setWebhook`,
      {
        url: webhookUrl,
        secret_token: secret,
        allowed_updates: ['message', 'chat_member'],
      }
    );

    if (response.data.ok) {
      console.log(`Telegram webhook registered: ${webhookUrl}`);
    } else {
      console.error('Telegram webhook registration failed:', response.data);
    }
  } catch (error) {
    console.error(
      'Telegram webhook registration error:',
      error.response?.data || error.message
    );
  }
}

app.listen(PORT, async () => {
  console.log(`Xane waitlist backend listening on port ${PORT}`);
  await registerTelegramWebhook();
});
