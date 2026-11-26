const { pool } = require('../config/db');
const {
  sendPremiumDay7Reminder,
  sendPremiumExpiryEmail,
} = require('./emailService');
const { PREMIUM_REFERRAL_TARGET } = require('./tagService');

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // Every hour

let timer = null;
let running = false;

/*
 * Premium XaneTag reservations.
 *
 * A reservation is exclusive for 14 days (premium_xane_tag_deadline). Successful referrals are the
 * rows in referral_events, written when the referred person completes activation; the ones that
 * count are those created on or before the deadline.
 *
 *   - 10 within the window -> secured: premium_xane_tag is set and is_premium_tag_active = TRUE.
 *     Normally done by referralService.registerReferral the moment the 10th lands;
 *     activateEarnedReservations() is the safety net if that ever did not happen.
 *   - fewer at the deadline -> expired: premium_tag_expired_at is set AND, in the same statement,
 *     premium_xane_tag_requested is cleared (the name moves to premium_xane_tag_expired as
 *     history), so the tag is available again at once. Nothing else on the row changes: email,
 *     referral_code, referral_count, level and position all stay.
 *
 * The expiry email is sent afterwards and retried until it is recorded as sent. Releasing the tag
 * no longer waits for it: before this, the release ran only after the email and tried to set
 * referral_code (NOT NULL) to NULL, which failed for every Premium member, so expired names were
 * never freed.
 */

/** Count of referrals that landed inside the reservation window, as a SQL expression on `u`. */
const IN_WINDOW_REFERRALS_SQL = `(
  SELECT COUNT(*)::int FROM referral_events e
  WHERE e.referrer_id = u.id
    AND e.created_at <= u.premium_xane_tag_deadline
)`;

/** Secures reservations that reached the target in time but were not activated. */
async function activateEarnedReservations(db = pool) {
  const { rows } = await db.query(
    `UPDATE waitlist_users u
     SET premium_xane_tag = u.premium_xane_tag_requested,
         is_premium_tag_active = TRUE,
         premium_tag_activated_at = COALESCE(u.premium_tag_activated_at, NOW())
     WHERE u.premium_xane_tag_requested IS NOT NULL
       AND u.is_premium_tag_active = FALSE
       AND u.premium_xane_tag IS NULL
       AND u.premium_tag_expired_at IS NULL
       AND u.premium_xane_tag_deadline IS NOT NULL
       AND ${IN_WINDOW_REFERRALS_SQL} >= $1
     RETURNING u.id, u.premium_xane_tag`,
    [PREMIUM_REFERRAL_TARGET]
  );
  for (const row of rows) {
    console.log(`Premium XaneTag @${row.premium_xane_tag} secured for user ${row.id} (catch-up).`);
  }
  return rows;
}

/**
 * Expires reservations whose window closed short of the target, and frees their tag.
 * Also frees the tag of any reservation already marked expired that still holds it.
 */
async function releaseExpiredReservations(db = pool) {
  const { rows } = await db.query(
    `UPDATE waitlist_users u
     SET premium_tag_expired_at = COALESCE(u.premium_tag_expired_at, NOW()),
         premium_xane_tag_expired = u.premium_xane_tag_requested,
         premium_xane_tag_requested = NULL
     WHERE u.premium_xane_tag_requested IS NOT NULL
       AND u.is_premium_tag_active = FALSE
       AND u.premium_xane_tag IS NULL
       AND (
         u.premium_tag_expired_at IS NOT NULL
         OR (
           u.premium_xane_tag_deadline IS NOT NULL
           AND u.premium_xane_tag_deadline <= NOW()
           AND ${IN_WINDOW_REFERRALS_SQL} < $1
         )
       )
     RETURNING u.id, u.premium_xane_tag_expired`,
    [PREMIUM_REFERRAL_TARGET]
  );
  for (const row of rows) {
    console.log(`Premium XaneTag @${row.premium_xane_tag_expired} released (user ${row.id}).`);
  }
  return rows;
}

/** Sends (or retries) the expiry email for every expired reservation not yet emailed. */
async function sendPendingExpiryEmails(db = pool) {
  const { rows } = await db.query(
    `SELECT id FROM waitlist_users
     WHERE premium_tag_expired_at IS NOT NULL
       AND premium_expiry_email_sent_at IS NULL
       AND is_premium_tag_active = FALSE
       AND premium_xane_tag_expired IS NOT NULL
     ORDER BY premium_tag_expired_at`
  );
  let sent = 0;
  for (const { id } of rows) {
    try {
      if (await sendPremiumExpiryEmail({ userId: id })) sent++;
    } catch (err) {
      console.error(`Failed to send Premium expiry email for user ${id}:`, err.message);
    }
  }
  return sent;
}

/** Day-7 reminder: 7 days left, still short of the target. */
async function sendDueDay7Reminders(db = pool) {
  const { rows } = await db.query(
    `SELECT u.id FROM waitlist_users u
     WHERE u.premium_xane_tag_requested IS NOT NULL
       AND u.is_premium_tag_active = FALSE
       AND u.premium_tag_expired_at IS NULL
       AND u.premium_day7_email_sent_at IS NULL
       AND u.premium_xane_tag_deadline IS NOT NULL
       AND u.premium_xane_tag_deadline - INTERVAL '7 days' <= NOW()
       AND u.premium_xane_tag_deadline > NOW()
       AND ${IN_WINDOW_REFERRALS_SQL} < $1`,
    [PREMIUM_REFERRAL_TARGET]
  );
  let sent = 0;
  for (const { id } of rows) {
    try {
      if ((await sendPremiumDay7Reminder({ userId: id })) === true) {
        await db.query(
          `UPDATE waitlist_users
           SET premium_day7_email_sent_at = NOW()
           WHERE id = $1 AND premium_day7_email_sent_at IS NULL`,
          [id]
        );
        sent++;
      }
    } catch (err) {
      console.error(`Failed to send Premium Day 7 reminder for user ${id}:`, err.message);
    }
  }
  return sent;
}

async function processPremiumTagChallenges() {
  if (running) return;
  running = true;
  try {
    // Order matters: secure what was earned before anything can expire it.
    for (const step of [
      activateEarnedReservations,
      releaseExpiredReservations,
      sendPendingExpiryEmails,
      sendDueDay7Reminders,
    ]) {
      try {
        await step();
      } catch (err) {
        console.error(`Premium challenge step ${step.name} failed:`, err.message);
      }
    }
  } finally {
    running = false;
  }
}

/**
 * Starts the scheduler and performs an initial check.
 */
function startPremiumTagChallengeScheduler() {
  if (timer) return;

  console.log('Premium XaneTag challenge scheduler started.');

  processPremiumTagChallenges().catch((err) => {
    console.error('Initial Premium challenge processing failed:', err.message);
  });

  timer = setInterval(() => {
    processPremiumTagChallenges().catch((err) => {
      console.error('Scheduled Premium challenge processing failed:', err.message);
    });
  }, CHECK_INTERVAL_MS);

  if (typeof timer.unref === 'function') {
    timer.unref();
  }
}

/**
 * Stops the scheduler.
 */
function stopPremiumTagChallengeScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = {
  IN_WINDOW_REFERRALS_SQL,
  activateEarnedReservations,
  releaseExpiredReservations,
  sendPendingExpiryEmails,
  sendDueDay7Reminders,
  processPremiumTagChallenges,
  startPremiumTagChallengeScheduler,
  stopPremiumTagChallengeScheduler,
};
