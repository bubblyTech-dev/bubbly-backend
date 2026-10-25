const AppError = require('@app/Helpers/AppError');
const Files = require('@app/Helpers/files');
const Storage = require('@app/Providers/Storage');
const filesConfig = require('@config/files');

// Serves stored files (local driver). Mounted once at /api/files, not versioned, because links are saved by browsers.
// Private types need the signed link made by Files.url(); anything wrong answers 404 so nothing is revealed.
const FileController = {
  async show(req, res) {
    const { type, name } = req.params;
    const rules = filesConfig.types[type];
    if (!rules || !Files.isValidName(name) || !Storage.resolvePath) throw AppError.notFound();

    const key = Files.keyFor(type, name);
    if (rules.visibility === 'private' && !Storage.verify(key, req.query.expires, req.query.signature)) throw AppError.notFound();
    if (!(await Storage.exists(key))) throw AppError.notFound();

    res.set({
      'Cross-Origin-Resource-Policy': 'cross-origin', // the Admin app lives on another address
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=300',
    });
    return res.sendFile(Storage.resolvePath(key));
  },
};

module.exports = FileController;
