const express = require('express');
const logger = require('@app/Helpers/logger');

const router = express.Router();

const groups = [
  { prefix: '/common', dir: 'Common' },
  { prefix: '/admin', dir: 'Admin' },
  { prefix: '/user', dir: 'User' },
];

for (const { prefix, dir } of groups) {
  router.use(prefix, require(`./${dir}`));
  logger.ok(`routes/V1/${dir}/index.js  ->  /api/v1${prefix}`);
}

module.exports = router;
