const express = require('express');
const { groups } = require('@app/Middleware/groups');

const router = express.Router();

// User routes (V1). Public routes (login) first, then the group, then the rest.
router.use('/auth', require('./auth'));

router.use(groups.user);
router.use('/subscription', require('./subscription'));
router.use('/dashboard', require('./dashboard'));
router.use('/school', require('./school'));
router.use('/profile', require('./profile'));
router.use('/classes', require('./classes'));
router.use('/students', require('./students'));
router.use('/teachers', require('./teachers'));
// add one file per feature below

module.exports = router;
