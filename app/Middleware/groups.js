/*
 |--------------------------------------------------------------------------
 | Middleware groups
 |--------------------------------------------------------------------------
 | A group is a named list of middleware that run in the order written.
 | Define it here once, apply it with one line.
 |
 | HOW TO USE
 |
 | 1) WHOLE FOLDER (the usual way): in routes/V1/<Admin|User|Common>/index.js
 |    mount public routes (login) FIRST, then apply the group, then mount the rest.
 |    Every route mounted AFTER the group line gets the whole group.
 |
 |      const { groups } = require('@app/Middleware/groups');
 |
 |      router.use('/auth', require('./auth'));   // login: no group
 |      router.use(groups.user);                  // group applies to everything below
 |      router.use('/students', require('./student'));
 |
 | 2) ONE ROUTE gets the group plus extra middleware: use withGroup(name, ...extra)
 |    (group runs first, then the extras in the order you list them, then the handler).
 |
 |      const { withGroup } = require('@app/Middleware/groups');
 |      const requireModule = require('@app/Middleware/requireModule');
 |
 |      router.get('/fees', withGroup('user', requireModule('fees')), FeeController.index);
 |
 | 3) ONE ROUTE gets only single middleware (no group): pass them directly.
 |
 |      const authenticate = require('@app/Middleware/authenticate');
 |      router.get('/me', authenticate, AuthController.me);
 |
 | 4) A single middleware on a route that is ALREADY inside a group: just add it.
 |    The group has already run, so this is only the extra one.
 |
 |      // inside a folder that did router.use(groups.user)
 |      router.post('/', requirePermission('students.create'), StudentController.store);
 |
 | ADDING A GROUP: add a new key below. ADDING MIDDLEWARE TO A GROUP: add it to
 | the array, in the position it should run.
 */
const authenticate = require('./authenticate');
const requireAdmin = require('./requireAdmin');
const resolveClient = require('./resolveClient');
const checkSubscription = require('./checkSubscription');
const rateLimit = require('./rateLimit');

const groups = {
  // Common routes (plans, signup, contact, webhooks)
  public: [rateLimit],

  // /api/v1/admin/*  (Super Admin and platform staff)
  admin: [authenticate, requireAdmin],

  // /api/v1/user/*  (principal, teacher, student)
  user: [authenticate, resolveClient, checkSubscription],
};

// group('user', extra1, extra2) -> [...group, extra1, extra2]
const withGroup = (name, ...extra) => {
  if (!groups[name]) throw new Error(`Middleware group "${name}" does not exist`);
  return [...groups[name], ...extra];
};

module.exports = { groups, withGroup };
