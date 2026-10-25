// Integer codes stored in the database. The meaning of each is also written in the column comment.

module.exports = {
  ADMIN_TYPE: { MASTER: 1, STAFF: 2 },
  ADMIN_STATUS: { ACTIVE: 1, INACTIVE: 2, LOCKED: 3 },
  LOGIN_METHOD: { PASSWORD: 1, GOOGLE: 2 },
  LOGIN_RESULT: { SUCCESS: 1, FAILED: 2 },
  LOGIN_FAILURE: { WRONG_PASSWORD: 1, UNKNOWN_EMAIL: 2, INACTIVE: 3, LOCKED: 4 },
  YES: 1,
  NO: 0,
};
