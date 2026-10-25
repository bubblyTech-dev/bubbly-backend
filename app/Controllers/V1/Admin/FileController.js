const AppError = require('@app/Helpers/AppError');
const Response = require('@app/Helpers/Response');
const Files = require('@app/Helpers/files');

const FileController = {
  // what the upload box may send for a type
  rules(req, res) {
    return Response.success(res, { data: Files.publicRules(String(req.query.type || '')) });
  },

  // the file is already in temp (uploadTemp middleware); check it and hand back its temp name
  async upload(req, res) {
    if (!req.file) throw AppError.validation({ file: ['Please choose a file.'] });

    const extension = Files.extensionOf(req.file.filename);
    if (!(await Files.looksValid(req.file.path, extension))) {
      await Files.removeTemp(Files.ownerOf(req.admin), req.file.filename);
      throw AppError.validation({ file: ['The file content does not match its type.'] });
    }

    return Response.success(res, {
      message: 'Uploaded.',
      data: { name: req.file.filename, originalName: req.file.originalname, size: req.file.size },
    });
  },
};

module.exports = FileController;
