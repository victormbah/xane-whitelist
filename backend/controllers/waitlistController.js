const { pool } = require('../config/db');
const otpService = require('../services/otpService');
const referralService = require('../services/referralService');
const { deepLinkForUser } = require('../config/telegram');
const {
  normalizeTag,
  isValidTagFormat,
  isValidPremiumTagFormat,
  isReserved,
} = require('../utils/xanetag');

// ---- Username availability -------------------------------------------------

async function checkUsername(req, res, next) {
  try {
    const rawTag = req.query.tag;
    const type = String(req.query.type || 'free').toLowerCase();

    const tag = normalizeTag(rawTag);

    if (!tag) {
      return res.status(400).json({
        available: false,
        reason: 'XaneTag is required',
      });
    }

    const isPremium = type === 'premium';

    const valid = isPremium
      ? isValidPremiumTagFormat(tag)
      : isValidTagFormat(tag);

    if (!valid) {
      return res.json({
        available: false,
        reason: isPremium
          ? 'Must be 3-20 lowercase letters, numbers or underscores.'
          : 'Must be 5-20 characters and contain at least one number or underscore.',
      });
    }

    if (isReserved(tag)) {
      return res.json({
        available: false,
        reason: 'This XaneTag is reserved.',
      });
    }

    const { rows } = await pool.query(
      `SELECT 1
       FROM waitlist_users
       WHERE LOWER(xane_tag) = $1
          OR LOWER(premium_xane_tag) = $1
       LIMIT 1`,
      [tag]
    );

    res.json({
      available: rows.length === 0,
    });
  } catch (err) {
    next(err);
  }
}

// ---- Inline OTP -------------------------------------------------------------

async function requestOtp(req, res, next) {
  try {
    const { identifier, purpose } = req.body;
    if (!identifier || !['phone', 'email'].includes(purpose)) {
      return res.status(400).json({ error: 'identifier and a valid purpose are required' });
    }
    const result = await otpService.requestOtp({ identifier, purpose });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function verifyOtp(req, res, next) {
  try {
    const { identifier, purpose, code } = req.body;
    if (!identifier || !purpose || !code) {
      return res.status(400).json({ error: 'identifier, purpose and code are required' });
    }
    const result = await otpService.verifyOtp({ identifier, purpose, code });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

// ---- Join waitlist ----------------------------------------------------------

async function joinWaitlist(req, res, next) {
  try {
    const { fullName, phone, email, xaneTag, premiumXaneTag, referralCode } = req.body;

    if (!fullName || !phone || !email || !xaneTag) {
      return res.status(400).json({ error: 'fullName, phone, email and xaneTag are required' });
    }

    const tag = normalizeTag(xaneTag);

if (
  !isValidTagFormat(tag) ||
  isReserved(tag)
) {
  return res.status(400).json({
    error: 'Invalid XaneTag. Free XaneTags must contain at least one number or underscore and be 3-20 characters.',
  });
}

    const phoneOk = await otpService.isVerified({ identifier: phone, purpose: 'phone' });
    const emailOk = await otpService.isVerified({ identifier: email, purpose: 'email' });
    if (!phoneOk) return res.status(400).json({ error: 'Phone is not verified yet' });
    if (!emailOk) return res.status(400).json({ error: 'Email is not verified yet' });

    let premiumTag = null;
let premiumDeadline = null;

if (premiumXaneTag) {
  premiumTag = normalizeTag(premiumXaneTag);

  if (
    !isValidPremiumTagFormat(premiumTag) ||
    isReserved(premiumTag)
  ) {
    return res.status(400).json({
      error: 'Invalid premium XaneTag.',
    });
  }
      premiumDeadline = referralService.premiumTagDeadline();
    }

    let referredBy = null;
    if (referralCode) {
      const { rows } = await pool.query(
        `SELECT id FROM waitlist_users WHERE referral_code = $1 OR xane_tag = $1`,
        [normalizeTag(referralCode)]
      );
      if (rows[0]) referredBy = rows[0].id;
    }

    const insertResult = await pool.query(
      `INSERT INTO waitlist_users
        (full_name, phone, phone_verified, email, email_verified,
         xane_tag, referral_code, premium_xane_tag_requested, premium_xane_tag_deadline, referred_by)
       VALUES ($1, $2, TRUE, $3, TRUE, $4, $4, $5, $6, $7)
       RETURNING *`,
      [fullName.trim(), phone, email.toLowerCase().trim(), tag, premiumTag, premiumDeadline, referredBy]
    );

    const user = insertResult.rows[0];

    res.status(201).json({
      userId: user.id,
      xaneTag: user.xane_tag,
      telegramDeepLink: deepLinkForUser(user.id),
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Phone, email or XaneTag already registered' });
    }
    next(err);
  }
}

// ---- Telegram status polling -------------------------------------------------

async function telegramStatus(req, res, next) {
  try {
    const { userId } = req.params;
    const { rows } = await pool.query(
      `SELECT telegram_verified, status FROM waitlist_users WHERE id = $1`,
      [userId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ telegramConnected: rows[0].telegram_verified, status: rows[0].status });
  } catch (err) {
    next(err);
  }
}

// ---- Success screen / "my status" -------------------------------------------

async function getMe(req, res, next) {
  try {
    const { userId } = req.params;
    const { rows } = await pool.query(
  `SELECT * FROM waitlist_users WHERE id = $1`,
  [userId]
);
    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'Not found' });

    const activeTag = user.is_premium_tag_active && user.premium_xane_tag ? user.premium_xane_tag : user.xane_tag;

    res.json({
      xaneTag: activeTag,
      position: user.position,
      level: user.level,
      referralCount: user.referral_count,
      referralLink: `${process.env.FRONTEND_URL}/join?ref=${user.referral_code}`,
      status: user.status,
    });
  } catch (err) {
    next(err);
  }
}

// ---- "Your Climb" screen -----------------------------------------------------

async function getClimb(req, res, next) {
  try {
    const { userId } = req.params;
    const { rows } = await pool.query(
  `SELECT * FROM waitlist_users WHERE id = $1`,
  [userId]
);
    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'Not found' });

    const { nextLevel, levelForReferralCount, LEVELS } = require('../services/levelService');
    const currentLevelInfo = levelForReferralCount(user.referral_count);
    const upcoming = nextLevel(currentLevelInfo.key);

    res.json({
      position: user.position,
      referralCount: user.referral_count,
      currentLevel: currentLevelInfo,
      nextLevel: upcoming
        ? { ...upcoming, referralsNeeded: Math.max(0, upcoming.threshold - user.referral_count) }
        : null,
      ladder: LEVELS,
      referralLink: `${process.env.FRONTEND_URL}/join?ref=${user.referral_code}`,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  checkUsername,
  requestOtp,
  verifyOtp,
  joinWaitlist,
  telegramStatus,
  getMe,
  getClimb,
};
