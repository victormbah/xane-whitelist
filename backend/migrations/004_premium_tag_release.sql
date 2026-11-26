-- Premium XaneTag reservations: release the tag when a reservation expires.
--
-- Additive only. No row is changed here: releasing the tags that are already stuck is done by the
-- scheduler (premiumTagChallengeService.releaseExpiredReservations), and can be previewed first
-- with scripts/release-expired-premium-tags.js.
--
-- premium_xane_tag_expired keeps the name whose reservation ran out, so the expiry email, the
-- dashboard and any later audit can still say which tag it was after premium_xane_tag_requested
-- has been cleared. It is NOT unique and NOT a claim: availability never looks at it.
ALTER TABLE waitlist_users
  ADD COLUMN IF NOT EXISTS premium_xane_tag_expired TEXT;

-- Production already has these nullable (Premium-only members have no free tag; phone was removed
-- from sign-up); 001 still declares them NOT NULL. This brings a fresh database in line and is a
-- no-op where they are already nullable.
ALTER TABLE waitlist_users ALTER COLUMN xane_tag DROP NOT NULL;
ALTER TABLE waitlist_users ALTER COLUMN phone DROP NOT NULL;

-- Availability and referral lookups compare LOWER(column) = $1.
CREATE INDEX IF NOT EXISTS idx_waitlist_users_lower_xane_tag
  ON waitlist_users (LOWER(xane_tag));
CREATE INDEX IF NOT EXISTS idx_waitlist_users_lower_premium_requested
  ON waitlist_users (LOWER(premium_xane_tag_requested));
CREATE INDEX IF NOT EXISTS idx_waitlist_users_lower_premium_tag
  ON waitlist_users (LOWER(premium_xane_tag));
CREATE INDEX IF NOT EXISTS idx_waitlist_users_lower_email
  ON waitlist_users (LOWER(TRIM(email)));
