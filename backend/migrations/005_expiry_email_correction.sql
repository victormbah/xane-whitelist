-- One row per member who has been sent the corrected expiry email
-- (scripts/send-corrected-expiry-emails.js), so it is never sent twice. Additive only.
CREATE TABLE IF NOT EXISTS premium_expiry_corrections (
  user_id  UUID PRIMARY KEY REFERENCES waitlist_users(id),
  sent_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
