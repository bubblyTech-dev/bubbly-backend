const path = require('path');
require('dotenv').config({ quiet: true });

const auth = require('./auth');
const app = require('./app');

// Everything about files lives here: where they are kept, which types exist and what each type allows.
// To allow or stop an extension, edit the list of that type below. The Admin app reads the same rules
// from GET /api/v1/admin/files/rules?type=..., so the two never disagree.
//
// The database stores only the file NAME (for example 20261025-143012-a1b2c3.png).
// The folder always comes from the type, so moving to another disk or bucket never touches the data.

const extensions = {
  // svg is left out on purpose: an svg can carry scripts. Add it to a type only if that type really needs it.
  image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'heic', 'heif', 'tif', 'tiff'],
  video: ['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v', 'mpg', 'mpeg', '3gp', 'wmv', 'flv', 'ogv'],
  document: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt'],
};

module.exports = {
  // 'local' = this server's disk (storage/uploads). 's3' (R2 or S3) is added later and only needs this setting changed.
  driver: process.env.STORAGE_DRIVER || 'local',

  local: {
    root: path.join(__dirname, '..', 'storage', 'uploads'),
    tempRoot: path.join(__dirname, '..', 'storage', 'temp'),
  },

  // uploads wait in temp until the form is saved; anything older than this is deleted
  tempTtlHours: 24,

  // public address of this API, used to build file links
  publicUrl: (process.env.API_PUBLIC_URL || `http://localhost:${app.port}`).replace(/\/$/, ''),

  // signs the temporary links of private files
  signingSecret: process.env.FILES_SIGNING_SECRET || auth.accessSecret,

  extensions,

  types: {
    adminProfile: {
      folder: 'admin/profile',
      extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
      maxSizeMB: 5,
      maxFiles: 1, // more than 1 means a multiple upload
      visibility: 'private', // private files are only reachable through a signed link
      urlTtlMinutes: 360, // how long a signed link works
    },
    userProfile: {
      folder: 'users/profile',
      extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
      maxSizeMB: 5,
      maxFiles: 1,
      visibility: 'private',
      urlTtlMinutes: 360,
    },
    clientLogo: {
      folder: 'clients/logo',
      extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
      maxSizeMB: 3,
      maxFiles: 1,
      visibility: 'private',
      urlTtlMinutes: 360,
    },
  },
};
