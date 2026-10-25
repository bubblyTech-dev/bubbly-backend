const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const config = require('@config/files');

// Keeps files on this server's disk under storage/uploads. Every driver offers the same functions,
// so the rest of the code never knows where the files really are.

const root = path.resolve(config.local.root);

// a key is "<folder>/<name>"; never let it point outside the root
const absolute = (key) => {
  const full = path.resolve(root, key);
  if (!full.startsWith(root + path.sep)) throw new Error('Invalid storage key.');
  return full;
};

const sign = (key, expires) => crypto.createHmac('sha256', config.signingSecret).update(`files|${key}|${expires}`).digest('hex');

// moves a file that is waiting in temp into its final place
const store = async (tempPath, key) => {
  const target = absolute(key);
  await fs.mkdir(path.dirname(target), { recursive: true });
  try {
    await fs.rename(tempPath, target);
  } catch (err) {
    if (err.code !== 'EXDEV') throw err; // temp and uploads on different disks
    await fs.copyFile(tempPath, target);
    await fs.unlink(tempPath);
  }
};

const remove = (key) => fs.rm(absolute(key), { force: true });

const exists = (key) =>
  fs
    .access(absolute(key))
    .then(() => true)
    .catch(() => false);

// the link the browser uses. Private files carry an expiry and a signature.
const url = ({ type, name, key, signed, ttlMinutes }) => {
  const base = `${config.publicUrl}/api/files/${type}/${name}`;
  if (!signed) return base;
  const expires = Math.floor(Date.now() / 1000) + ttlMinutes * 60;
  return `${base}?expires=${expires}&signature=${sign(key, expires)}`;
};

const verify = (key, expires, signature) => {
  if (!expires || !signature || Number(expires) < Math.floor(Date.now() / 1000)) return false;
  const expected = Buffer.from(sign(key, expires));
  const given = Buffer.from(String(signature));
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
};

module.exports = { store, remove, exists, url, verify, resolvePath: absolute };
