const express = require('express');
const { groups } = require('@app/Middleware/groups');

const router = express.Router();

// Common routes (V1): plans, signup, contact, login for public use, webhooks
router.use(groups.public);
router.use(require('./ping')); // TEMP demo
// add one file per feature below, e.g. router.use('/plans', require('./plan'));

module.exports = router;
