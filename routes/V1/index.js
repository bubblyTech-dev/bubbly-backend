const express = require('express');

const router = express.Router();

const groups = [
  { prefix: '/common', dir: 'Common' },
  { prefix: '/admin', dir: 'Admin' },
  { prefix: '/user', dir: 'User' },
];

for (const { prefix, dir } of groups) {
  router.use(prefix, require(`./${dir}`));
}

module.exports = router;
