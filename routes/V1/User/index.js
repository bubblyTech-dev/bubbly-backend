const express = require('express');
const { groups } = require('@app/Middleware/groups');

const router = express.Router();

// User routes (V1). Public routes (login) first, then the group, then the rest.
router.use('/auth', require('./auth'));

router.use(groups.user);
router.use('/subscription', require('./subscription'));
// add one file per feature below, e.g. router.use('/students', require('./student'));

module.exports = router;
