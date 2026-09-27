// Telegram will echo back whatever secret_token you set via setWebhook in the
// 'X-Telegram-Bot-Api-Secret-Token' header on every request. Reject anything
// that doesn't match so randoms can't POST fake "user joined" events at us.
function verifyTelegramSecret(req, res, next) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  const provided = req.get('X-Telegram-Bot-Api-Secret-Token');

  if (!expected || provided !== expected) {
    return res.sendStatus(401);
  }
  next();
}

module.exports = { verifyTelegramSecret };
