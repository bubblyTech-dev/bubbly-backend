const { AsyncLocalStorage } = require('async_hooks');

// The school the current request belongs to. It is set once by the resolveClient middleware (from the logged-in
// user's database row, never from the request) and every school-owned model reads it from here.
//
//   context.run(clientId, fn)               everything started inside fn belongs to that school
//   context.clientId()                      the current school id (or null)
//   context.runWithoutTenant(reason, fn)    the ONE reviewed way to touch school data without a school
//                                           (login by email, refresh token lookup, platform jobs). Give a real reason.
//
// Raw SQL, sequelize.query, unscoped(), upsert, increment and decrement are banned on school-owned models.

const storage = new AsyncLocalStorage();

const current = () => storage.getStore() || null;

const clientId = () => {
  const store = current();
  return store && store.clientId !== undefined ? store.clientId : null;
};

const isBypassed = () => Boolean(current() && current().bypass);

const run = (id, fn) => {
  if (id === null || id === undefined || id === '') throw new Error('A tenant context needs a client id.');
  return storage.run({ clientId: String(id) }, fn);
};

const runWithoutTenant = (reason, fn) => {
  if (typeof reason !== 'string' || reason.trim().length < 5) {
    throw new Error('runWithoutTenant needs a reason that says why this code may see every school.');
  }
  return storage.run({ bypass: true, reason }, fn);
};

module.exports = { run, runWithoutTenant, clientId, isBypassed, current };
