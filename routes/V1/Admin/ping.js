const express = require('express');
const logger = require('@app/Helpers/logger');
const requireModule = require('@app/Middleware/requireModule');

const router = express.Router();

// TEMPORARY demo routes to see middleware order in the terminal (delete this file later)
// /ping       -> only the folder's group (applied in index.js)
// /ping-extra -> the folder's group + one extra middleware
router.get('/ping', (req, res) => res.json({ ok: true, route: 'admin/ping' }));
router.get('/ping-extra', requireModule('fees'), (req, res) => res.json({ ok: true, route: 'admin/ping-extra' }));
logger.ok('routes/V1/Admin/ping.js  ->  GET /api/v1/admin/ping, /api/v1/admin/ping-extra  (TEMP)');

module.exports = router;
