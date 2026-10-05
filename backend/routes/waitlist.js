const express = require('express');
const rateLimit = require('express-rate-limit');
const waitlistController = require('../controllers/waitlistController');

const router = express.Router();

// OTP requests are the main abuse vector (SMS/email cost money) — rate limit hard.
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

router.get('/check-username', waitlistController.checkUsername);
router.post('/otp/request', otpLimiter, waitlistController.requestOtp);
router.post('/otp/verify', waitlistController.verifyOtp);
router.post('/join', waitlistController.joinWaitlist);
router.get('/telegram-status/:userId', waitlistController.telegramStatus);
router.get('/me/:userId', waitlistController.getMe);
router.get('/climb/:userId', waitlistController.getClimb);
router.get(
  '/referral-preview',
  waitlistController.getReferralPreview
);

module.exports = router;
