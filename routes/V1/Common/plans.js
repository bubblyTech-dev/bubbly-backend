const express = require('express');
const PlanController = require('@app/Controllers/V1/Common/PlanController');

const router = express.Router();

router.get('/', PlanController.index);

module.exports = router;
