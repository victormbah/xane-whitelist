const { pool } = require('../config/db');
const otpService = require('../services/otpService');
const referralService = require('../services/referralService');
const { deepLinkForUser } = require('../config/telegram');

const {
  normalizeTag,
  isReserved,
  getTagValidationError,
  suggestAlternatives,
} = require('../utils/xanetag');

// ---- Username availability -------------------------------------------------

async function checkUsername(req, res, next) {
  try {
    const rawTag = String(
      req.query.tag || req.body?.tag || ''
    ).trim();

    const type = String(
      req.query.type || req.body?.type || 'free'
    ).toLowerCase();

    const isPremium = type === 'premium';

    const validationError = getTagValidationError(rawTag, {
      premium: isPremium,
    });

    if (validationError) {
      return res.json({
        available: false,
        reason: validationError,
      });
    }

    const tag = normalizeTag(rawTag);

    if (isReserved(tag)) {
      return res.json({
        available: false,
        reason: 'This tag is reserved.',
        suggestions: suggestAlternatives(tag),
      });
    }

    const { rows } = await pool.query(
      `SELECT 1
       FROM waitlist_users
       WHERE LOWER(xane_tag) = $1
          OR LOWER(premium_xane_tag_requested) = $1
          OR LOWER(premium_xane_tag) = $1
       LIMIT 1`,
      [tag]
    );

    if (rows.length > 0) {
      return res.json({
        available: false,
        reason: 'Not available',
        suggestions: suggestAlternatives(tag),
      });
    }

    return res.json({
      available: true,
    });
  } catch (err) {
    next(err);
  }
}

// ---- Inline OTP ------------------------------------------------------------

async function requestOtp(req, res, next) {
  try {
    const { identifier, purpose } = req.body;

    if (!identifier || !['phone', 'email'].includes(purpose)) {
      return res.status(400).json({
        error: 'identifier and a valid purpose are required',
      });
    }

    const result = await otpService.requestOtp({
      identifier,
      purpose,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function verifyOtp(req, res, next) {
  try {
    const { identifier, purpose, code } = req.body;

    if (!identifier || !purpose || !code) {
      return res.status(400).json({
        error: 'identifier, purpose and code are required',
      });
    }

    const result = await otpService.verifyOtp({
      identifier,
      purpose,
      code,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
}

// ---- Join waitlist ----------------------------------------------------------

async function joinWaitlist(req, res, next) {
  try {
    const {
      fullName,
      phone,
      email,
      xaneTag,
      premiumXaneTag,
      referralCode,
    } = req.body;

    if (!fullName || !phone || !email || !xaneTag) {
      return res.status(400).json({
        error: 'Full name, phone, email and XaneTag are required',
      });
    }

    // -------------------------------------------------------------------------
    // NORMALIZE BASIC VALUES
    // -------------------------------------------------------------------------

    const normalizedEmail = email.toLowerCase().trim();
    const normalizedPhone = String(phone).trim();

    // -------------------------------------------------------------------------
    // DUPLICATE PHONE / EMAIL
    // -------------------------------------------------------------------------

    const duplicateAccount = await pool.query(
      `SELECT 1
       FROM waitlist_users
       WHERE LOWER(TRIM(email)) = $1
          OR regexp_replace(phone, '\\D', '', 'g') =
             regexp_replace($2, '\\D', '', 'g')
       LIMIT 1`,
      [normalizedEmail, normalizedPhone]
    );

    if (duplicateAccount.rows.length > 0) {
      return res.status(409).json({
        error: 'Phone or email already registered',
      });
    }

    // -------------------------------------------------------------------------
    // FREE XANETAG
    // -------------------------------------------------------------------------

    const freeTagError = getTagValidationError(xaneTag, {
      premium: false,
    });

    if (freeTagError) {
      return res.status(400).json({
        error: freeTagError,
      });
    }

    const tag = normalizeTag(xaneTag);

    if (isReserved(tag)) {
      return res.status(400).json({
        error: 'This XaneTag is reserved',
      });
    }

    // Check ALL tag types, including pending premium reservations.
    const freeTagTaken = await pool.query(
      `SELECT 1
       FROM waitlist_users
       WHERE LOWER(xane_tag) = $1
          OR LOWER(premium_xane_tag_requested) = $1
          OR LOWER(premium_xane_tag) = $1
       LIMIT 1`,
      [tag]
    );

    if (freeTagTaken.rows.length > 0) {
      return res.status(409).json({
        error: 'XaneTag already registered',
      });
    }

    // -------------------------------------------------------------------------
    // OTP VERIFICATION
    // -------------------------------------------------------------------------

    const phoneOk = await otpService.isVerified({
      identifier: phone,
      purpose: 'phone',
    });

    const emailOk = await otpService.isVerified({
      identifier: email,
      purpose: 'email',
    });

    if (!phoneOk) {
      return res.status(400).json({
        error: 'Phone is not verified yet',
      });
    }

    if (!emailOk) {
      return res.status(400).json({
        error: 'Email is not verified yet',
      });
    }

    // -------------------------------------------------------------------------
    // PREMIUM XANETAG
    // -------------------------------------------------------------------------

    let premiumTag = null;
    let premiumDeadline = null;

    if (
      premiumXaneTag !== undefined &&
      premiumXaneTag !== null &&
      String(premiumXaneTag).trim() !== ''
    ) {
      const premiumTagError = getTagValidationError(
        premiumXaneTag,
        {
          premium: true,
        }
      );

      if (premiumTagError) {
        return res.status(400).json({
          error: premiumTagError,
        });
      }

      premiumTag = normalizeTag(premiumXaneTag);

      if (isReserved(premiumTag)) {
        return res.status(400).json({
          error: 'This premium XaneTag is reserved',
        });
      }

      if (premiumTag === tag) {
        return res.status(400).json({
          error: 'Premium XaneTag must be different',
        });
      }

      // Check pending + active premium tags AND free tags.
      const premiumTagTaken = await pool.query(
        `SELECT 1
         FROM waitlist_users
         WHERE LOWER(xane_tag) = $1
            OR LOWER(premium_xane_tag_requested) = $1
            OR LOWER(premium_xane_tag) = $1
         LIMIT 1`,
        [premiumTag]
      );

      if (premiumTagTaken.rows.length > 0) {
        return res.status(409).json({
          error: 'Premium XaneTag already registered',
        });
      }

      premiumDeadline = referralService.premiumTagDeadline();
    }

    // -------------------------------------------------------------------------
    // REFERRAL
    // -------------------------------------------------------------------------

    let referredBy = null;

    if (referralCode) {
      const normalizedReferralCode = normalizeTag(referralCode);

      const { rows } = await pool.query(
        `SELECT id
         FROM waitlist_users
         WHERE referral_code = $1
            OR LOWER(xane_tag) = $1
         LIMIT 1`,
        [normalizedReferralCode]
      );

      if (rows[0]) {
        referredBy = rows[0].id;
      }
    }

    // -------------------------------------------------------------------------
    // CREATE WAITLIST USER
    // -------------------------------------------------------------------------

    const insertResult = await pool.query(
      `INSERT INTO waitlist_users
        (
          full_name,
          phone,
          phone_verified,
          email,
          email_verified,
          xane_tag,
          referral_code,
          premium_xane_tag_requested,
          premium_xane_tag_deadline,
          referred_by
        )
       VALUES ($1, $2, TRUE, $3, TRUE, $4, $4, $5, $6, $7)
       RETURNING *`,
      [
        fullName.trim(),
        normalizedPhone,
        normalizedEmail,
        tag,
        premiumTag,
        premiumDeadline,
        referredBy,
      ]
    );

    const user = insertResult.rows[0];

    return res.status(201).json({
      userId: user.id,
      xaneTag: user.xane_tag,
      telegramDeepLink: deepLinkForUser(user.id),
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({
        error: 'Phone, email or XaneTag already registered',
      });
    }

    next(err);
  }
}

// ---- Telegram status polling -----------------------------------------------

async function telegramStatus(req, res, next) {
  try {
    const { userId } = req.params;

    const { rows } = await pool.query(
      `SELECT telegram_verified, status
       FROM waitlist_users
       WHERE id = $1`,
      [userId]
    );

    if (!rows[0]) {
      return res.status(404).json({
        error: 'Not found',
      });
    }

    res.json({
      telegramConnected: rows[0].telegram_verified,
      status: rows[0].status,
    });
  } catch (err) {
    next(err);
  }
}

// ---- Success screen / "my status" ------------------------------------------

async function getMe(req, res, next) {
  try {
    const { userId } = req.params;

    const { rows } = await pool.query(
      `SELECT *
       FROM waitlist_users
       WHERE id = $1`,
      [userId]
    );

    const user = rows[0];

    if (!user) {
      return res.status(404).json({
        error: 'Not found',
      });
    }

    const activeTag =
      user.is_premium_tag_active && user.premium_xane_tag
        ? user.premium_xane_tag
        : user.xane_tag;

    const referralLink =
      `${process.env.FRONTEND_URL}/join?ref=${user.referral_code}`;

    res.json({
      xaneTag: activeTag,
      position: user.position,
      level: user.level,
      referralCount: user.referral_count,
      referralLink,
      status: user.status,
    });
  } catch (err) {
    next(err);
  }
}

// ---- "Your Climb" screen ----------------------------------------------------

async function getClimb(req, res, next) {
  try {
    const { userId } = req.params;

    const { rows } = await pool.query(
      `SELECT *
       FROM waitlist_users
       WHERE id = $1`,
      [userId]
    );

    const user = rows[0];

    if (!user) {
      return res.status(404).json({
        error: 'Not found',
      });
    }

    const {
      nextLevel,
      levelForReferralCount,
      LEVELS,
    } = require('../services/levelService');

    const currentLevelInfo = levelForReferralCount(
      user.referral_count
    );

    const upcoming = nextLevel(currentLevelInfo.key);

    const referralLink =
      `${process.env.FRONTEND_URL}/join?ref=${user.referral_code}`;

    res.json({
      position: user.position,
      referralCount: user.referral_count,
      currentLevel: currentLevelInfo,

      nextLevel: upcoming
        ? {
            ...upcoming,
            referralsNeeded: Math.max(
              0,
              upcoming.threshold - user.referral_count
            ),
          }
        : null,

      ladder: LEVELS,
      referralLink,
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
