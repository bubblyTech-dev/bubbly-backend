const express = require('express');
const FileController = require('@app/Controllers/V1/Admin/FileController');
const rateLimit = require('@app/Middleware/rateLimit');
const uploadTemp = require('@app/Middleware/uploadTemp');

const router = express.Router();

router.get('/rules', FileController.rules);
router.post('/upload', rateLimit({ name: 'admin-upload', max: 30 }), uploadTemp, FileController.upload);

module.exports = router;
