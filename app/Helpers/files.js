const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('@config/files');
const AppError = require('@app/Helpers/AppError');
const Storage = require('@app/Providers/Storage');

// One place for everything about files (rules live in config/files.js).
//
//   upload      POST /admin/files/upload?type=adminProfile  -> saved in temp, returns the temp name
//   save form   const name = await Files.commit('adminProfile', tempName, { owner })   moves temp -> real folder
//   old file    await Files.remove('adminProfile', oldName)
//   show        Files.url('adminProfile', name)   -> full link (used inside Resources)

const NAME_PATTERN = /^\d{8}-\d{6}-[a-f0-9]{6}\.[a-z0-9]{1,5}$/;
const OWNER_PATTERN = /^[a-z0-9-]{1,80}$/;

const getRules = (type) => {
  const rules = config.types[type];
  if (!rules) throw AppError.validation({ type: ['This file type is not supported.'] });
  return rules;
};

const isValidName = (name) => typeof name === 'string' && NAME_PATTERN.test(name);

const extensionOf = (name) => path.extname(String(name)).slice(1).toLowerCase();

const pad = (number) => String(number).padStart(2, '0');

// 20261025-143012-a1b2c3.png : date, time, a short random part, extension
const newName = (originalName) => {
  const now = new Date();
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const extension = extensionOf(originalName).replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin';
  return `${stamp}-${crypto.randomBytes(3).toString('hex')}.${extension}`;
};

// the temp folder of one user: nobody can pick up somebody else's upload
const ownerOf = (admin) => `admin-${admin.uuid}`;

const tempDir = (owner) => {
  if (!OWNER_PATTERN.test(owner)) throw new Error('Invalid file owner.');
  return path.join(config.local.tempRoot, owner);
};

const keyFor = (type, name) => `${getRules(type).folder}/${name}`;

// what the upload box needs to know (also sent to the browser)
const publicRules = (type) => {
  const rules = getRules(type);
  return { type, extensions: rules.extensions, maxSizeMB: rules.maxSizeMB, maxFiles: rules.maxFiles };
};

const isAllowed = (type, name) => getRules(type).extensions.includes(extensionOf(name));

// A name ending in .png must really start like a png. Stops html or scripts renamed to .jpg.
const SIGNATURES = {
  jpg: [[0xff, 0xd8, 0xff]],
  jpeg: [[0xff, 0xd8, 0xff]],
  png: [[0x89, 0x50, 0x4e, 0x47]],
  gif: [[0x47, 0x49, 0x46, 0x38]],
  webp: [[0x52, 0x49, 0x46, 0x46]],
  pdf: [[0x25, 0x50, 0x44, 0x46]],
};

const looksValid = async (filePath, extension) => {
  const signatures = SIGNATURES[extension];
  if (!signatures) return true; // no check known for this extension
  const handle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(8);
    await handle.read(buffer, 0, 8, 0);
    return signatures.some((signature) => signature.every((byte, index) => buffer[index] === byte));
  } finally {
    await handle.close();
  }
};

const removeTemp = (owner, name) => fs.rm(path.join(tempDir(owner), name), { force: true });

// Moves an uploaded temp file into its real folder and returns the name to store in the database.
// `field` is the form field, so a problem is shown next to it.
const commit = async (type, tempName, { owner, field = 'file' } = {}) => {
  const rules = getRules(type);
  const problem = (message) => AppError.validation({ [field]: [message] });

  if (!isValidName(tempName) || !isAllowed(type, tempName)) throw problem('This file is not valid. Please upload it again.');

  const tempPath = path.join(tempDir(owner), tempName);
  const stat = await fs.stat(tempPath).catch(() => null);
  if (!stat) throw problem('The uploaded file was not found or has expired. Please upload it again.');
  if (stat.size > rules.maxSizeMB * 1024 * 1024) throw problem(`The file is larger than ${rules.maxSizeMB} MB.`);
  if (!(await looksValid(tempPath, extensionOf(tempName)))) {
    await removeTemp(owner, tempName);
    throw problem('The file content does not match its type.');
  }

  await Storage.store(tempPath, keyFor(type, tempName));
  return tempName;
};

const remove = async (type, name) => {
  if (!name || !isValidName(name)) return;
  await Storage.remove(keyFor(type, name));
};

// the full link for a stored name (null when there is no file)
const url = (type, name) => {
  if (!name) return null;
  const rules = getRules(type);
  return Storage.url({
    type,
    name,
    key: keyFor(type, name),
    signed: rules.visibility === 'private',
    ttlMinutes: rules.urlTtlMinutes,
  });
};

// deletes temp files nobody saved
const cleanTemp = async () => {
  const limit = Date.now() - config.tempTtlHours * 3600 * 1000;
  const owners = await fs.readdir(config.local.tempRoot).catch(() => []);

  for (const owner of owners) {
    const dir = path.join(config.local.tempRoot, owner);
    const names = await fs.readdir(dir).catch(() => []);
    for (const name of names) {
      const stat = await fs.stat(path.join(dir, name)).catch(() => null);
      if (stat && stat.mtimeMs < limit) await fs.rm(path.join(dir, name), { force: true });
    }
    if (!(await fs.readdir(dir).catch(() => ['x'])).length) await fs.rmdir(dir).catch(() => {});
  }
};

const ensureTempDir = (owner) => {
  const dir = tempDir(owner);
  fsSync.mkdirSync(dir, { recursive: true });
  return dir;
};

// Saves a file our own code generated (for example an invoice PDF) through the same checks and storage as uploads.
// Returns the name to keep in the database.
const putGenerated = async (type, buffer, originalName) => {
  const rules = getRules(type);
  const owner = 'system';
  const name = newName(originalName);
  if (buffer.length > rules.maxSizeMB * 1024 * 1024) throw new Error(`Generated file is larger than ${rules.maxSizeMB} MB.`);
  await fs.writeFile(path.join(ensureTempDir(owner), name), buffer);
  return commit(type, name, { owner });
};

// a readable stream of a stored file (null when the storage cannot stream it)
const stream = (type, name) => {
  if (!name || !isValidName(name) || !Storage.openReadStream) return null;
  return Storage.openReadStream(keyFor(type, name));
};

module.exports = {
  getRules,
  publicRules,
  isValidName,
  isAllowed,
  extensionOf,
  newName,
  ownerOf,
  ensureTempDir,
  looksValid,
  removeTemp,
  keyFor,
  commit,
  remove,
  url,
  cleanTemp,
  putGenerated,
  stream,
};
