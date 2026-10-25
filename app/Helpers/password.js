const crypto = require('crypto');
const { promisify } = require('util');

const scrypt = promisify(crypto.scrypt);

// scrypt from Node's own crypto module (no extra package). Stored as: scrypt$N$r$p$salt$hash
const N = 32768;
const r = 8;
const p = 1;
const KEY_LENGTH = 64;
const MAX_MEM = 128 * N * r * 2;

const hash = async (password) => {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(password, salt, KEY_LENGTH, { N, r, p, maxmem: MAX_MEM });
  return ['scrypt', N, r, p, salt.toString('base64'), derived.toString('base64')].join('$');
};

const verify = async (password, stored) => {
  if (!stored || typeof stored !== 'string') return false;
  const [scheme, n, rr, pp, salt, key] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !key) return false;

  const expected = Buffer.from(key, 'base64');
  const derived = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, {
    N: Number(n),
    r: Number(rr),
    p: Number(pp),
    maxmem: 128 * Number(n) * Number(rr) * 2,
  });
  return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
};

// Do the same amount of work when the account does not exist, so response time does not reveal which emails are real.
let dummyHash;
const verifyDummy = async (password) => {
  dummyHash = dummyHash || (await hash('not-a-real-password'));
  await verify(password, dummyHash);
  return false;
};

module.exports = { hash, verify, verifyDummy };
