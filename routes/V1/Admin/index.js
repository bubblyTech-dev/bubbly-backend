const express = require('express');
const { groups } = require('@app/Middleware/groups');

const router = express.Router();

// Admin routes (V1). Public routes (login) first, then the group, then the rest.
router.use('/auth', require('./auth'));

router.use(groups.admin);
router.use(require('./ping')); // TEMP demo
// add one file per feature below, e.g. router.use('/clients', require('./client'));

module.exports = router;
