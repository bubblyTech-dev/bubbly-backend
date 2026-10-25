const express = require('express');
const app = require('@config/app');

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok', app: app.name, env: app.env, time: new Date().toISOString() });
});

router.use('/files', require('./files')); // stored files, not versioned
router.use(`/${app.apiVersion}`, require('./V1'));

module.exports = router;
