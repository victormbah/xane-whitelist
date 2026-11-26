const express = require('express');
const cors = require('cors');

const waitlistRoutes = require('./routes/waitlist');
const leaderboardRoutes = require('./routes/leaderboard');
const telegramRoutes = require('./routes/telegram');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();

// Browsers may call this API from the waitlist site's addresses. During the move from
// www.xane.app to waitlist.xane.app both must work, so this is a list rather than FRONTEND_URL
// alone (FRONTEND_URL still decides the links in emails, unchanged). CORS_ORIGINS
// (comma-separated) adds more. With neither FRONTEND_URL nor CORS_ORIGINS set outside
// production (local development), any origin is allowed, as before.
const WAITLIST_ORIGINS = ['https://waitlist.xane.app', 'https://www.xane.app'];
const configuredOrigins = [process.env.FRONTEND_URL, ...(process.env.CORS_ORIGINS || '').split(',')]
  .map((o) => (o || '').trim().replace(/\/+$/, ''))
  .filter(Boolean);
const allowedOrigins = new Set([...WAITLIST_ORIGINS, ...configuredOrigins]);
const openForDevelopment = configuredOrigins.length === 0 && process.env.NODE_ENV !== 'production';

app.use(cors({ origin: openForDevelopment ? '*' : (origin, done) => done(null, !!origin && allowedOrigins.has(origin)) }));
app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/api/waitlist', waitlistRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/telegram', telegramRoutes);
// Server-to-server (wallet backend). No CORS needed: it is never called from a browser.
app.use('/api/internal', require('./routes/internal'));

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use(errorHandler);

module.exports = app;
