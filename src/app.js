const express = require('express');
const cors = require('cors');

const waitlistRoutes = require('./routes/waitlist');
const leaderboardRoutes = require('./routes/leaderboard');
const telegramRoutes = require('./routes/telegram');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/api/waitlist', waitlistRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/telegram', telegramRoutes);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use(errorHandler);

module.exports = app;
