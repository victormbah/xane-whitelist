-- Xane Waitlist schema

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS waitlist_users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name           TEXT NOT NULL,

  phone               TEXT UNIQUE NOT NULL,
  phone_verified      BOOLEAN NOT NULL DEFAULT FALSE,

  email               TEXT UNIQUE NOT NULL,
  email_verified      BOOLEAN NOT NULL DEFAULT FALSE,

  xane_tag            TEXT UNIQUE NOT NULL,       -- e.g. erva1
  premium_xane_tag_requested TEXT UNIQUE,          -- reserved candidate, e.g. erva
  premium_xane_tag_deadline  TIMESTAMPTZ,          -- 14-day window to hit 10 referrals
  premium_xane_tag    TEXT UNIQUE,                -- active tag once earned (drops the number)
  is_premium_tag_active BOOLEAN NOT NULL DEFAULT FALSE,

  telegram_verified   BOOLEAN NOT NULL DEFAULT FALSE,
  telegram_user_id    TEXT UNIQUE,
  telegram_username   TEXT,

  referral_code       TEXT UNIQUE NOT NULL,       -- shareable code, distinct from xane_tag
  referred_by         UUID REFERENCES waitlist_users(id),
  referral_count      INTEGER NOT NULL DEFAULT 0,

  level               TEXT NOT NULL DEFAULT 'waitlist_member',
  -- waitlist_member | scout | advocate | ambassador | lead | captain | founding_council

  position            INTEGER,                    -- computed/denormalized rank, lower is better
  base_position        INTEGER,                    -- position at signup, before referral boosts

  status              TEXT NOT NULL DEFAULT 'pending',
  -- pending (form filled, not fully verified) | active (phone+email+telegram verified) | flagged

  flagged             BOOLEAN NOT NULL DEFAULT FALSE,
  flagged_reason       TEXT,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_waitlist_users_referred_by ON waitlist_users(referred_by);
CREATE INDEX IF NOT EXISTS idx_waitlist_users_position ON waitlist_users(position);
CREATE INDEX IF NOT EXISTS idx_waitlist_users_referral_count ON waitlist_users(referral_count DESC);
CREATE INDEX IF NOT EXISTS idx_waitlist_users_xane_tag ON waitlist_users(xane_tag);

-- OTP verification attempts for phone/email inline verification.
-- Sendchamp generates and delivers the actual code; we just track the
-- reference it gives us so we know which attempt a confirm call belongs to.
CREATE TABLE IF NOT EXISTS otp_codes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier            TEXT NOT NULL,          -- phone number or email address being verified
  purpose               TEXT NOT NULL,          -- 'phone' | 'email'
  sendchamp_reference   TEXT NOT NULL,
  attempts              INTEGER NOT NULL DEFAULT 0,
  max_attempts          INTEGER NOT NULL DEFAULT 5,
  verified              BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at            TIMESTAMPTZ NOT NULL,
  last_sent_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_otp_identifier_purpose ON otp_codes(identifier, purpose);

-- Individual referral events (one row per person who joined via a referral link).
-- Kept separate from the referral_count denormalized field so we can check
-- time-bound goals like "10 referrals in 14 days" for the premium XaneTag.
CREATE TABLE IF NOT EXISTS referral_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id   UUID NOT NULL REFERENCES waitlist_users(id),
  referred_id   UUID NOT NULL REFERENCES waitlist_users(id) UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_events_referrer ON referral_events(referrer_id, created_at);

-- Level-up email log, so we don't re-send the same milestone email twice
CREATE TABLE IF NOT EXISTS level_up_emails_sent (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES waitlist_users(id),
  level         TEXT NOT NULL,
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, level)
);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_waitlist_users_updated_at ON waitlist_users;
CREATE TRIGGER trg_waitlist_users_updated_at
BEFORE UPDATE ON waitlist_users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
