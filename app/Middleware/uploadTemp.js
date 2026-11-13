const multer = require('multer');
const AppError = require('@app/Helpers/AppError');
const Files = require('@app/Helpers/files');

// Receives ONE file (form field "file") and saves it in the temp folder of the logged-in admin.
// The type comes from the address: POST /admin/files/upload?type=adminProfile (rules in config/files.js).
// The file only moves to its real folder when the form that uses it is saved (Files.commit).
const uploadTemp = (req, res, next) => {
  const type = String(req.query.type || '');
  const rules = Files.getRules(type); // unknown type -> 422
  const owner = Files.ownerOf(req.admin);

  const receive = multer({
    storage: multer.diskStorage({
      destination: (request, file, done) => done(null, Files.ensureTempDir(owner)),
      filename: (request, file, done) => done(null, Files.newName(file.originalname)),
    }),
    limits: { fileSize: rules.maxSizeMB * 1024 * 1024, files: 1, fields: 0, parts: 2 },
    fileFilter: (request, file, done) => {
      if (Files.isAllowed(type, file.originalname)) return done(null, true);
      return done(AppError.validation({ file: [`Only ${rules.extensions.join(', ')} files are allowed.`] }));
    },
  }).single('file');

  receive(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') return next(AppError.validation({ file: [`The file is larger than ${rules.maxSizeMB} MB.`] }));
      return next(AppError.badRequest('The upload could not be read.'));
    }
    return next(err);
  });
};

module.exports = uploadTemp;
