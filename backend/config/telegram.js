const axios = require('axios');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

const client = axios.create({
  baseURL: `https://api.telegram.org/bot${BOT_TOKEN}`,
  timeout: 15000,
});

async function sendMessage(chatId, text, extra = {}) {
  return client.post('/sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', ...extra });
}

function deepLinkForUser(userId) {
  // Requires TELEGRAM_BOT_USERNAME to be set to your bot's @username (no @).
  const botUsername = process.env.TELEGRAM_BOT_USERNAME;
  return `https://t.me/${botUsername}?start=${userId}`;
}

module.exports = { telegramClient: client, sendMessage, deepLinkForUser };
