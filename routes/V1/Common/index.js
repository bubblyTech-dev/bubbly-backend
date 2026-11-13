const express = require('express');
const { groups } = require('@app/Middleware/groups');

const router = express.Router();

// Common routes (V1): plans, signup, contact, login for public use, webhooks
router.use(groups.public);
router.use('/plans', require('./plans')); // published plans for the pricing page
router.use('/inquiries', require('./inquiries'));
router.use('/announcements', require('./announcements'));
// add one file per feature below, e.g. router.use('/plans', require('./plan'));

module.exports = router;
