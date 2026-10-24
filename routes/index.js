const express = require('express');
const logger = require('@app/Helpers/logger');
const app = require('@config/app');

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok', app: app.name, env: app.env, time: new Date().toISOString() });
});
logger.ok('routes/index.js  ->  /api/health');

router.use(`/${app.apiVersion}`, require('./V1'));

module.exports = router;
