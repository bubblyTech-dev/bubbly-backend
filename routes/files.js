const express = require('express');
const FileController = require('@app/Controllers/V1/Common/FileController');

const router = express.Router();

// GET /api/files/:type/:name   (private types need the signed link)
router.get('/:type/:name', FileController.show);

module.exports = router;
