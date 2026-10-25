const express = require('express');
const { groups } = require('@app/Middleware/groups');

const router = express.Router();

// Admin routes (V1). Auth routes first (login is public; the other auth routes protect themselves),
// then the admin group (authenticateAdmin), then everything else.
router.use('/auth', require('./auth'));

router.use(groups.admin);
router.use('/files', require('./files'));
router.use('/profile', require('./profile'));
router.use(require('./ping')); // TEMP demo
router.use('/announcements', require('./announcements'));
// add one file per feature below, e.g. router.use('/clients', require('./client'));

module.exports = router;
