const express = require('express');
const { groups, withGroup } = require('@app/Middleware/groups');
const requireModule = require('@app/Middleware/requireModule');

const router = express.Router();

// User routes (V1). Public routes (login) first, then the group, then the rest.
router.use('/auth', require('./auth'));

// TEMP demo: a single route outside the group that opts in with withGroup + one extra middleware
router.get('/ping-solo', withGroup('user', requireModule('fees')), (req, res) => res.json({ ok: true, route: 'user/ping-solo' }));

router.use(groups.user);
router.use(require('./ping')); // TEMP demo
// add one file per feature below, e.g. router.use('/students', require('./student'));

module.exports = router;
