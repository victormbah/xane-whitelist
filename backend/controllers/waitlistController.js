const { pool } = require('../config/db');
const otpService = require('../services/otpService');
const referralService = require('../services/referralService');
const { deepLinkForUser } = require('../config/telegram');
const { sendWelcomeEmail } = require('../services/emailService');
const {
  TAG_HELD_SQL,
  HELD_TAG_SQL,
  isTagTaken,
  lockTag,
  uniqueReferralCode,
  heldTag,
  premiumSummary,
  referralLink: buildReferralLink,
} = require('../services/tagService');

const {
  normalizeTag,
  isReserved,
  getTagValidationError,
  suggestAlternatives,
} = require('../utils/xanetag');

const ALREADY_REGISTERED = {
  error:
    'This email is already on the waitlist. Sign in with a code sent to your email to open your dashboard.',
  code: 'ALREADY_REGISTERED',
};

/** What the dashboard needs about a member, shared by /me and sign-in. */
function memberView(user) {
  return {
    userId: user.id,
    xaneTag: heldTag(user),
    premium: premiumSummary(user),
    position: user.position,
    level: user.level,
    referralCount: user.referral_count,
    referralLink: buildReferralLink(user),
    status: user.status,
    telegramConnected: user.telegram_verified,
    telegramDeepLink: deepLinkForUser(user.id),
  };
}

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

    // Free tags, secured Premium tags and running reservations. An expired
    // reservation holds nothing, so its name is offered again here.
    if (await isTagTaken(pool, tag)) {
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

    // Sign-in codes are only redeemed through /login/verify, which returns the session.
    if (!identifier || !['phone', 'email'].includes(purpose) || !code) {
      return res.status(400).json({
        error: 'identifier, a valid purpose and code are required',
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

// ---- Referral preview ------------------------------------------------------

async function getReferralPreview(req, res, next) {
  try {
    const referralCode = String(req.query.ref || "").trim().toLowerCase();

    if (!referralCode) {
      return res.status(400).json({
        message: "Referral code is required.",
      });
    }

    // A member whose reservation expired holds no tag, so their first name is
    // shown instead: never a released name someone else may now own.
    const { rows } = await pool.query(
      `SELECT ${HELD_TAG_SQL} AS referrer_tag,
              split_part(TRIM(full_name), ' ', 1) AS referrer_name
       FROM waitlist_users
       WHERE LOWER(referral_code) = $1
       LIMIT 1`,
      [referralCode]
    );

    if (!rows[0]) {
      return res.status(404).json({
        message: "Referral not found.",
      });
    }

    return res.json({
      referrerTag: rows[0].referrer_tag,
      referrerName: rows[0].referrer_name || null,
    });
  } catch (err) {
    next(err);
  }
}

// ---- Join waitlist ---------------------------------------------------------

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

    // -----------------------------------------------------------------------
    // PHONE TEMPORARILY DISABLED
    //
    // OLD VALIDATION:
    //
    // if (
    //   !fullName ||
    //   !phone ||
    //   !email ||
    //   (!xaneTag && !premiumXaneTag)
    // ) {
    //   return res.status(400).json({
    //     error: 'Full name, phone, email and a XaneTag are required',
    //   });
    // }
    //
    // Phone is intentionally not required while it is removed from the UX.
    // -----------------------------------------------------------------------

    if (
      !fullName ||
      !email ||
      (!xaneTag && !premiumXaneTag)
    ) {
      return res.status(400).json({
        error: 'Full name, email and a XaneTag are required',
      });
    }

    // -----------------------------------------------------------------------
    // NORMALIZE BASIC VALUES
    // -----------------------------------------------------------------------

    const normalizedEmail = String(email)
      .toLowerCase()
      .trim();

    // PHONE TEMPORARILY DISABLED
    //
    // Old phone normalization:
    //
    // const normalizedPhone = String(phone).trim();

    // -----------------------------------------------------------------------
    // DUPLICATE PHONE / EMAIL
    // -----------------------------------------------------------------------

    // PHONE TEMPORARILY DISABLED
    //
    // Old duplicate phone + email check:
    //
    // const duplicateAccount = await pool.query(
    //   `SELECT 1
    //    FROM waitlist_users
    //    WHERE LOWER(TRIM(email)) = $1
    //       OR regexp_replace(phone, '\\D', '', 'g') =
    //          regexp_replace($2, '\\D', '', 'g')
    //    LIMIT 1`,
    //   [normalizedEmail, normalizedPhone]
    // );
    //
    // if (duplicateAccount.rows.length > 0) {
    //   return res.status(409).json({
    //     error: 'Phone or email already registered',
    //   });
    // }

    // Temporary email-only duplicate check.
    const duplicateAccount = await pool.query(
      `SELECT 1
       FROM waitlist_users
       WHERE LOWER(TRIM(email)) = $1
       LIMIT 1`,
      [normalizedEmail]
    );

    // A registered email can never start a new membership (or a new 14-day
    // reservation). The member signs in with an email code instead.
    if (duplicateAccount.rows.length > 0) {
      return res.status(409).json(ALREADY_REGISTERED);
    }

    // -----------------------------------------------------------------------
    // TAG SELECTION
    // -----------------------------------------------------------------------

    const hasFreeTag =
      xaneTag !== undefined &&
      xaneTag !== null &&
      String(xaneTag).trim() !== '';

    const hasPremiumTag =
      premiumXaneTag !== undefined &&
      premiumXaneTag !== null &&
      String(premiumXaneTag).trim() !== '';

    // Frontend should submit only one based on the selected radio button.
    if (hasFreeTag && hasPremiumTag) {
      return res.status(400).json({
        error:
          'Choose either a Free XaneTag or a Premium XaneTag',
      });
    }

    let tag = null;
    let premiumTag = null;
    let premiumDeadline = null;

    // -----------------------------------------------------------------------
    // FREE XANETAG
    // -----------------------------------------------------------------------

    if (hasFreeTag) {
      const freeTagError = getTagValidationError(xaneTag, {
        premium: false,
      });

      if (freeTagError) {
        return res.status(400).json({
          error: freeTagError,
        });
      }

      tag = normalizeTag(xaneTag);

      if (isReserved(tag)) {
        return res.status(400).json({
          error: 'This XaneTag is reserved',
        });
      }

    }

    // -----------------------------------------------------------------------
    // PREMIUM XANETAG
    // -----------------------------------------------------------------------

    if (hasPremiumTag) {
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

      premiumDeadline = referralService.premiumTagDeadline();
    }

    // -----------------------------------------------------------------------
    // OTP VERIFICATION
    // -----------------------------------------------------------------------

    // PHONE TEMPORARILY DISABLED
    //
    // Old phone OTP verification:
    //
    // const phoneOk = await otpService.isVerified({
    //   identifier: normalizedPhone,
    //   purpose: 'phone',
    // });
    //
    // if (!phoneOk) {
    //   return res.status(400).json({
    //     error: 'Phone is not verified yet',
    //   });
    // }

    // Email verification remains required.
    const emailOk = await otpService.isVerified({
      identifier: normalizedEmail,
      purpose: 'email',
    });

    if (!emailOk) {
      return res.status(400).json({
        error: 'Email is not verified yet',
      });
    }

    // -----------------------------------------------------------------------
    // CLAIM THE TAG AND CREATE THE MEMBER, IN ONE TRANSACTION
    //
    // The tag is locked first, so the availability check and the insert can't
    // interleave with another sign-up claiming the same name in any column
    // (free tag, Premium reservation, secured Premium). The UNIQUE constraints
    // remain the last line of defence; a 23505 below still answers 409.
    // -----------------------------------------------------------------------

    const claimedTag = tag || premiumTag;
    const client = await pool.connect();
    let user;

    try {
      await client.query('BEGIN');
      await lockTag(client, claimedTag);

      if (await isTagTaken(client, claimedTag)) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: premiumTag
            ? 'Premium XaneTag already registered'
            : 'XaneTag already registered',
        });
      }

      // Referrer: an exact referral code wins (links already shared keep
      // crediting the person who shared them); otherwise a tag someone holds.
      let referredBy = null;

      if (referralCode) {
        const normalizedReferralCode = normalizeTag(referralCode);

        const { rows } = await client.query(
          `SELECT id
           FROM waitlist_users
           WHERE LOWER(referral_code) = $1
              OR ${TAG_HELD_SQL}
           ORDER BY (LOWER(referral_code) = $1) DESC
           LIMIT 1`,
          [normalizedReferralCode]
        );

        if (rows[0]) {
          referredBy = rows[0].id;
        }
      }

      // The tag itself, unless an earlier member still uses that name as their
      // referral code (their reservation of it expired): then tag + suffix.
      const userReferralCode = await uniqueReferralCode(client, claimedTag);

      // PHONE TEMPORARILY DISABLED: phone is not inserted. phone_verified stays
      // TRUE so the existing Telegram activation flow keeps working.
      const insertResult = await client.query(
        `INSERT INTO waitlist_users
         (
           full_name,
           phone_verified,
           email,
           email_verified,
           xane_tag,
           referral_code,
           premium_xane_tag_requested,
           premium_xane_tag_deadline,
           referred_by
         )
         VALUES ($1, TRUE, $2, TRUE, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          fullName.trim(),
          normalizedEmail,
          tag,
          userReferralCode,
          premiumTag,
          premiumDeadline,
          referredBy,
        ]
      );

      await client.query('COMMIT');
      user = insertResult.rows[0];
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    // Send the welcome email with the user's personal referral link.
    sendWelcomeEmail({ userId: user.id }).catch((err) => {
      console.error('Failed to send waitlist welcome email:', err.message);
    });

    return res.status(201).json({
      userId: user.id,
      xaneTag: heldTag(user),
      telegramDeepLink: deepLinkForUser(user.id),
    });
  } catch (err) {
    if (err.code === '23505') {
      // Old message when phone was part of signup:
      //
      // error: 'Phone, email or XaneTag already registered',

      return res.status(409).json({
        error: 'Email or XaneTag already registered',
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

    // xaneTag is null after an expired reservation; premium.status says why.
    res.json(memberView(user));
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

    const referralLink = buildReferralLink(user);

    res.json({
      position: user.position,
      referralCount: user.referral_count,
      currentLevel: currentLevelInfo,

      nextLevel: upcoming
        ? {
            ...upcoming,
            referralsNeeded: Math.max(
              0,
              upcoming.threshold -
                user.referral_count
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

// ---- Sign in (existing members) --------------------------------------------
//
// An existing member, including one whose Premium reservation expired, gets
// back to their dashboard with a one-time code sent to their registered email.
// The answer to /login/request is the same whether or not the email is on the
// waitlist. Each code works once (otpService marks it verified) and allows 5
// wrong tries.

function normalizeEmail(raw) {
  return String(raw || '').trim().toLowerCase();
}

async function requestLogin(req, res, next) {
  try {
    const email = normalizeEmail(req.body?.email);

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ error: 'Enter a valid email address' });
    }

    const result = await otpService.requestOtp({
      identifier: email,
      purpose: 'login',
    });

    res.json({
      ...result,
      message: "If this email is on the waitlist, we've sent it a sign-in code.",
    });
  } catch (err) {
    next(err);
  }
}

async function verifyLogin(req, res, next) {
  try {
    const email = normalizeEmail(req.body?.email);
    const code = String(req.body?.code || '').trim();

    if (!email || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: 'Email and the 6-digit code are required' });
    }

    await otpService.verifyOtp({ identifier: email, purpose: 'login', code });

    const { rows } = await pool.query(
      `SELECT * FROM waitlist_users WHERE LOWER(TRIM(email)) = $1 LIMIT 1`,
      [email]
    );

    if (!rows[0]) {
      return res.status(400).json({ error: 'Incorrect or expired code' });
    }

    res.json(memberView(rows[0]));
  } catch (err) {
    next(err);
  }
}

// ---- Exports ----------------------------------------------------------------

module.exports = {
  checkUsername,
  requestOtp,
  verifyOtp,
  getReferralPreview,
  joinWaitlist,
  telegramStatus,
  getMe,
  getClimb,
  requestLogin,
  verifyLogin,
};