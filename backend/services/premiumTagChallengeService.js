const { pool } = require('../config/db');
const {
  sendPremiumDay7Reminder,
  sendPremiumExpiryEmail,
} = require('./emailService');

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // Every hour
const DAY_7_MS = 7 * 24 * 60 * 60 * 1000;

let timer = null;
let running = false;

/**
 * Processes pending Premium XaneTag reservations.
 *
 * Day 7: Sends a reminder if the user has fewer than 10 referrals.
 * Day 14: Expires the reservation if the user has fewer than 10 referrals.
 * Expiry emails are retried if sending fails.
 * Activated Premium tags are never expired by this service.
 */
async function processPremiumTagChallenges() {
  if (running) return;

  running = true;

  try {
    const { rows: users } = await pool.query(
      `SELECT
         id,
         premium_xane_tag_requested,
         premium_xane_tag_deadline,
         premium_tag_activated_at,
         premium_tag_expired_at,
         premium_day7_email_sent_at,
         premium_expiry_email_sent_at,
         referral_count,
         created_at
       FROM waitlist_users
       WHERE premium_xane_tag_requested IS NOT NULL
         AND is_premium_tag_active = FALSE
         AND (
           premium_tag_expired_at IS NULL
           OR premium_expiry_email_sent_at IS NULL
         )
       ORDER BY premium_xane_tag_deadline ASC NULLS LAST`
    );

    for (const user of users) {
      try {
        const deadline = user.premium_xane_tag_deadline
          ? new Date(user.premium_xane_tag_deadline)
          : null;

        if (!deadline || Number.isNaN(deadline.getTime())) {
          console.error(
            `Premium challenge has no valid deadline for user ${user.id}`
          );
          continue;
        }

        const now = new Date();
        const referralCount = Number(user.referral_count) || 0;
        const originalTag = user.premium_xane_tag_requested;

        /*
         * EXPIRED RESERVATION
         *
         * If already expired, retry the email when it has not been
         * recorded as sent. Otherwise, expire only after the deadline
         * and only when the user has fewer than 10 referrals.
         */
        if (user.premium_tag_expired_at) {
          if (!user.premium_expiry_email_sent_at && originalTag) {
            try {
              await sendPremiumExpiryEmail({
                userId: user.id,
                tag: originalTag,
              });

              // The email service records its sent timestamp on success.
              // Release the tag only after successful email delivery.
              await pool.query(
                `UPDATE waitlist_users
                 SET premium_xane_tag_requested = NULL,
                     referral_code = CASE
                       WHEN LOWER(referral_code) = LOWER($2)
                       THEN NULL
                       ELSE referral_code
                     END
                 WHERE id = $1
                   AND premium_tag_expired_at IS NOT NULL
                   AND premium_expiry_email_sent_at IS NOT NULL
                   AND is_premium_tag_active = FALSE`,
                [user.id, originalTag]
              );
            } catch (err) {
              console.error(
                `Failed to retry Premium expiry email for user ${user.id}:`,
                err.message
              );
            }
          }

          continue;
        }

        /*
         * ACTIVE DEADLINE HAS PASSED
         */
        if (now >= deadline) {
          if (referralCount >= 10) {
            // Do not expire a user who has met the referral target.
            // Normal referral processing should activate their tag.
            console.warn(
              `User ${user.id} has reached 10 referrals but their Premium tag is not active.`
            );
            continue;
          }

          const { rows: expiredUsers } = await pool.query(
            `UPDATE waitlist_users
             SET premium_tag_expired_at = NOW()
             WHERE id = $1
               AND is_premium_tag_active = FALSE
               AND premium_tag_expired_at IS NULL
               AND premium_xane_tag_requested IS NOT NULL
               AND premium_xane_tag_deadline <= NOW()
               AND referral_count < 10
             RETURNING id`,
            [user.id]
          );

          if (expiredUsers.length === 0) {
            // The user may have activated their tag or received
            // additional referrals while this job was running.
            continue;
          }

          try {
            await sendPremiumExpiryEmail({
              userId: user.id,
              tag: originalTag,
            });

            // Release the requested tag only after the email service
            // confirms success by recording the sent timestamp.
            await pool.query(
              `UPDATE waitlist_users
               SET premium_xane_tag_requested = NULL,
                   referral_code = CASE
                     WHEN LOWER(referral_code) = LOWER($2)
                     THEN NULL
                     ELSE referral_code
                   END
               WHERE id = $1
                 AND premium_tag_expired_at IS NOT NULL
                 AND premium_expiry_email_sent_at IS NOT NULL
                 AND is_premium_tag_active = FALSE`,
              [user.id, originalTag]
            );
          } catch (err) {
            console.error(
              `Failed to send Premium expiry email for user ${user.id}:`,
              err.message
            );
          }

          continue;
        }

        /*
         * DAY 7 REMINDER
         *
         * The deadline is 14 days after registration, so the reminder
         * becomes due when 7 days remain.
         */
        const day7Time = new Date(deadline.getTime() - DAY_7_MS);

        if (
          now >= day7Time &&
          !user.premium_day7_email_sent_at &&
          referralCount < 10
        ) {
          try {
            const sent = await sendPremiumDay7Reminder({
              userId: user.id,
            });

            // The email function should return true only when it sends
            // the reminder successfully.
            if (sent === true) {
              await pool.query(
                `UPDATE waitlist_users
                 SET premium_day7_email_sent_at = NOW()
                 WHERE id = $1
                   AND premium_day7_email_sent_at IS NULL
                   AND is_premium_tag_active = FALSE
                   AND premium_tag_expired_at IS NULL`,
                [user.id]
              );
            }
          } catch (err) {
            console.error(
              `Failed to send Premium Day 7 reminder for user ${user.id}:`,
              err.message
            );
          }
        }
      } catch (err) {
        console.error(
          `Failed to process Premium challenge for user ${user.id}:`,
          err.message
        );
      }
    }
  } catch (err) {
    console.error(
      'Premium challenge processor failed:',
      err.message
    );
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
    console.error(
      'Initial Premium challenge processing failed:',
      err.message
    );
  });

  timer = setInterval(() => {
    processPremiumTagChallenges().catch((err) => {
      console.error(
        'Scheduled Premium challenge processing failed:',
        err.message
      );
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
  processPremiumTagChallenges,
  startPremiumTagChallengeScheduler,
  stopPremiumTagChallengeScheduler,
};