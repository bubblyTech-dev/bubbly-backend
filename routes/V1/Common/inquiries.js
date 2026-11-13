const express = require('express');
const InquiryController = require('@app/Controllers/V1/Common/InquiryController');
const validate = require('@app/Middleware/validate');
const rateLimit = require('@app/Middleware/rateLimit');
const StoreInquiryRequest = require('@app/Requests/V1/Common/Inquiries/StoreInquiryRequest');

const router = express.Router();

// public contact / demo form: 5 messages per 15 minutes from one address
router.post(
  '/',
  rateLimit({ name: 'inquiry', windowMs: 15 * 60000, max: 5 }),
  validate(StoreInquiryRequest),
  InquiryController.store,
);

module.exports = router;
