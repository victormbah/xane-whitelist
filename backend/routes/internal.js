const express = require('express');
const rateLimit = require('express-rate-limit');
const { snapshotHandler } = require('../services/walletSyncService');

// Server-to-server only. Authenticated by an HMAC signature (see walletSyncService); answers 404
// when WAITLIST_SYNC_SECRET is not set, so the route does not exist until the integration is on.
const router = express.Router();

router.get(
  '/wallet-sync/snapshot',
  rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false }),
  snapshotHandler
);

module.exports = router;
