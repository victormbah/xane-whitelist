ALTER TABLE waitlist_users
  ADD COLUMN IF NOT EXISTS premium_tag_activated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS premium_tag_expired_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS premium_day7_email_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS premium_expiry_email_sent_at TIMESTAMPTZ;