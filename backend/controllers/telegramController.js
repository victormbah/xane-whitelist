const { pool } = require('../config/db');
const { sendMessage } = require('../config/telegram');
const referralService = require('../services/referralService');
const { sendLevelUpEmail } = require('../services/emailService');

const GROUP_ID = process.env.TELEGRAM_GROUP_ID;

/**
 * Once a user is verified on phone + email + telegram, they go 'active':
 * they get a base_position assigned and the welcome/level-1 email fires.
 */
async function tryActivate(user) {
  if (user.status === 'active') return user;
  if (!(user.phone_verified && user.email_verified && user.telegram_verified)) return user;

await referralService.assignBasePosition(user.id);

await pool.query(
  `UPDATE waitlist_users
   SET status = 'active'
   WHERE id = $1`,
  [user.id]
);

if (user.referred_by) {
  await referralService.registerReferral({
    referrerId: user.referred_by,
    referredUserId: user.id,
  });
}

  const { rows } = await pool.query(
    `SELECT * FROM waitlist_users WHERE id = $1`,
    [user.id]
  );

  const activated = rows[0];

  sendLevelUpEmail({
    userId: activated.id,
    level: 'waitlist_member',
  }).catch((err) =>
    console.error('Failed to send welcome email:', err.message)
  );

  return activated;
}

/**
 * Single webhook endpoint for all Telegram updates.
 */
async function handleWebhook(req, res, next) {
  try {
    const update = req.body;

    if (update.message?.text?.startsWith('/start')) {
      await handleStartCommand(update.message);
    }

    if (update.chat_member) {
      await handleChatMemberUpdate(update.chat_member);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('Telegram webhook error:', err.message);
    res.sendStatus(200);
  }
}

async function handleStartCommand(message) {
  const [, payloadUserId] = message.text.split(' ');

  if (!payloadUserId) return;

  const { rows } = await pool.query(
    `SELECT * FROM waitlist_users WHERE id = $1`,
    [payloadUserId]
  );

  const user = rows[0];

  if (!user) return;

  await pool.query(
    `UPDATE waitlist_users
     SET telegram_user_id = $1, telegram_username = $2
     WHERE id = $3`,
    [
      String(message.from.id),
      message.from.username || null,
      user.id,
    ]
  );

  const groupInviteText = `
<b>🎉 You're almost done!</b>

Your Xane waitlist account is connected to this Telegram account.

Join the official Xane Community using the button below.

Once you've joined, return to the waitlist page — your membership will be verified automatically.

<b>Welcome to Xane. 🚀</b>
`;

  await sendMessage(message.chat.id, groupInviteText, {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: 'Join Xane Community',
            url: 'https://t.me/Xanecommunity',
          },
        ],
      ],
    },
  });
}

async function handleChatMemberUpdate(chatMember) {
  if (String(chatMember.chat.id) !== String(GROUP_ID)) return;

  const newStatus = chatMember.new_chat_member?.status;

  if (!['member', 'administrator', 'creator'].includes(newStatus)) {
    return;
  }

  const telegramUserId = String(chatMember.new_chat_member.user.id);

  const { rows } = await pool.query(
    `SELECT * FROM waitlist_users WHERE telegram_user_id = $1`,
    [telegramUserId]
  );

  const user = rows[0];

  if (!user || user.telegram_verified) return;

  await pool.query(
    `UPDATE waitlist_users SET telegram_verified = TRUE WHERE id = $1`,
    [user.id]
  );

  await tryActivate({
    ...user,
    telegram_verified: true,
  });
}

module.exports = { handleWebhook };
