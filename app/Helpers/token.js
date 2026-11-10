const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const auth = require('@config/auth');

// Access token: short-lived JWT sent in the Authorization header. Holds only who and which session, never permissions.
const signAdminAccess = ({ adminUuid, sessionUuid }) =>
  jwt.sign({ typ: 'admin', sid: sessionUuid }, auth.accessSecret, {
    algorithm: 'HS256',
    subject: adminUuid,
    issuer: auth.issuer,
    audience: auth.adminAudience,
    expiresIn: auth.accessTtlSeconds,
  });

// the same for school users (Principal, Teacher, Student); a different audience, so an admin token never works here
const signUserAccess = ({ userUuid, sessionUuid }) =>
  jwt.sign({ typ: 'user', sid: sessionUuid }, auth.accessSecret, {
    algorithm: 'HS256',
    subject: userUuid,
    issuer: auth.issuer,
    audience: auth.schoolAudience,
    expiresIn: auth.accessTtlSeconds,
  });

const verifyUserAccess = (token) => {
  try {
    const payload = jwt.verify(token, auth.accessSecret, {
      algorithms: ['HS256'],
      issuer: auth.issuer,
      audience: auth.schoolAudience,
    });
    return payload.typ === 'user' && payload.sub && payload.sid ? payload : null;
  } catch {
    return null;
  }
};

// returns the payload, or null when the token is missing, expired or not ours
const verifyAdminAccess = (token) => {
  try {
    const payload = jwt.verify(token, auth.accessSecret, {
      algorithms: ['HS256'],
      issuer: auth.issuer,
      audience: auth.adminAudience,
    });
    return payload.typ === 'admin' && payload.sub && payload.sid ? payload : null;
  } catch {
    return null;
  }
};

// Refresh and reset tokens are random strings. Only their SHA-256 hash is stored.
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const newOpaqueToken = () => {
  const token = crypto.randomBytes(48).toString('base64url');
  return { token, hash: hashToken(token) };
};

module.exports = { signAdminAccess, verifyAdminAccess, signUserAccess, verifyUserAccess, hashToken, newOpaqueToken };
