# Xane Waitlist — Backend

Backend for the Xane waitlist signup flow: inline phone/email OTP, XaneTag
reservation, referral-based positioning and leveling, Telegram community
confirmation, and a public leaderboard.

Stack: **Node.js/Express**, **PostgreSQL**, **Sendchamp** (SMS + email OTP),
**Telegram Bot API**, deployed on **Render**.

## 1. Setup

```bash
npm install
cp .env.example .env   # fill in real values
npm run migrate         # applies src/migrations/001_init.sql
npm run dev              # local dev with nodemon
```

## 2. Environment variables

See `.env.example`. Key ones to get right before testing:

- `DATABASE_URL` — Render Postgres connection string.
- `SENDCHAMP_API_KEY` — from your Sendchamp dashboard. Start with a test key.
- `TELEGRAM_BOT_TOKEN` / `TELEGRAM_BOT_USERNAME` / `TELEGRAM_GROUP_ID` — see step 4.
- `TELEGRAM_WEBHOOK_SECRET` — any long random string you choose.

## 3. API endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/waitlist/check-username?tag=erva1` | Real-time XaneTag availability |
| POST | `/api/waitlist/otp/request` | `{ identifier, purpose: 'phone'\|'email' }` — sends OTP via Sendchamp |
| POST | `/api/waitlist/otp/verify` | `{ identifier, purpose, code }` — confirms OTP |
| POST | `/api/waitlist/join` | `{ fullName, phone, email, xaneTag, premiumXaneTag?, referralCode? }` — creates the waitlist row (requires phone+email already verified above) |
| GET | `/api/waitlist/telegram-status/:userId` | Poll for the frontend's Telegram step |
| GET | `/api/waitlist/me/:userId` | Success screen data: tag, position, level |
| GET | `/api/waitlist/climb/:userId` | "Your Climb" screen data: ladder + progress |
| GET | `/api/leaderboard?limit=100` | Public leaderboard — username, badge, friend count only |
| POST | `/api/telegram/webhook` | Telegram webhook (bot → backend), not for the frontend |

### Suggested frontend flow mapping

1. As the user types the phone/email, call `otp/request`, then `otp/verify` once they enter the code — this powers the inline Empty → Valid → Verification → Verified states from the spec.
2. As they type a XaneTag, debounce and call `check-username` — surface `suggestions` if taken.
3. On "Join the Waitlist", call `POST /join`. Response includes `telegramDeepLink` — open that (or show as a button) for the Telegram screen.
4. Poll `GET /telegram-status/:userId` every couple seconds while on the Telegram screen; when `telegramConnected: true`, move to the success screen.
5. Success screen: `GET /me/:userId`.
6. Leaderboard/"Your Climb" screen: `GET /climb/:userId` for the signed-in user's own progress, `GET /api/leaderboard` for the public list.

## 4. Telegram bot setup

1. Create a bot via [@BotFather](https://t.me/BotFather), grab the token → `TELEGRAM_BOT_TOKEN`, and its `@username` → `TELEGRAM_BOT_USERNAME`.
2. Add the bot to your Xane community group as an **admin** (it needs to be an admin to receive membership updates).
3. **Turn off group privacy mode** for the bot via BotFather (`/setprivacy` → Disable) — otherwise Telegram won't forward the `/start` payload or membership changes properly in group contexts.
4. Get your group's numeric chat ID (e.g. via `getUpdates` after adding the bot, or a helper bot like @RawDataBot) → `TELEGRAM_GROUP_ID`.
5. Register the webhook once your backend is deployed and reachable:

```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://<your-render-app>.onrender.com/api/telegram/webhook",
    "secret_token": "<TELEGRAM_WEBHOOK_SECRET>",
    "allowed_updates": ["message", "chat_member"]
  }'
```

How it works end to end:
- Backend generates `https://t.me/<bot>?start=<userId>` and hands it to the frontend as `telegramDeepLink`.
- User taps it → opens a DM with the bot → bot receives `/start <userId>` → backend links that Telegram account to the waitlist row and replies with instructions to join the group.
- User joins the group → Telegram sends a `chat_member` update → backend marks `telegram_verified = true` and, if phone + email are also verified, flips the user to `active`, assigns their waitlist position, and sends the welcome email.

## 5. Deploying to Render

1. Push this repo (or merge it into `xane-whitelist`) and create a new **Web Service** on Render pointing at it.
2. Build command: `npm install`. Start command: `npm start`.
3. Add a **Render Postgres** instance, and set `DATABASE_URL` from its connection string (`DATABASE_SSL=true` for the external URL).
4. Set all the other env vars from `.env.example` in the Render dashboard.
5. After first deploy, run the migration once (Render Shell, or a one-off job): `npm run migrate`.
6. Register the Telegram webhook (step 4 above) pointing at the live Render URL.

## 6. Things to double check before going live

- **Sendchamp endpoints**: the exact request/response shape for `/verification/create`, `/verification/confirm`, and the email-send path (`src/services/emailService.js`) should be checked against your current Sendchamp dashboard docs and a live test call — providers occasionally change field names.
- **Fraud/duplicate detection**: the schema has a `flagged` / `flagged_reason` column and the leaderboard already excludes flagged users and orphans their referrals, but there's no automated flagging logic yet (e.g. same device/IP creating many accounts) — that's a good next addition once you see real signup patterns.
- **Premium XaneTag window**: the 14-day countdown is tracked (`premium_xane_tag_deadline`), but nothing currently reverts a `premium_xane_tag_requested` back to unavailable if the deadline passes without reaching 10 referrals — worth a small scheduled job if you want that reservation to expire and free the tag up.
