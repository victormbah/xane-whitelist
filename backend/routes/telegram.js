const express = require('express');
const { handleWebhook } = require('../controllers/telegramController');
const { verifyTelegramSecret } = require('../middleware/telegramAuth');

const router = express.Router();

router.post('/webhook', verifyTelegramSecret, handleWebhook);

module.exports = router;
