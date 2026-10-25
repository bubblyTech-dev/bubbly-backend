const express = require('express');
const InquiryController = require('@app/Controllers/V1/Admin/InquiryController');
const requirePermission = require('@app/Middleware/requirePermission');
const validate = require('@app/Middleware/validate');
const ListInquiriesRequest = require('@app/Requests/V1/Admin/Inquiries/ListInquiriesRequest');
const UpdateInquiryStatusRequest = require('@app/Requests/V1/Admin/Inquiries/UpdateInquiryStatusRequest');
const AssignInquiryRequest = require('@app/Requests/V1/Admin/Inquiries/AssignInquiryRequest');
const StoreInquiryNoteRequest = require('@app/Requests/V1/Admin/Inquiries/StoreInquiryNoteRequest');

const router = express.Router();

// fixed paths first, so "counts" is never read as an inquiry uuid
router.get('/counts', requirePermission('inquiries.view'), InquiryController.counts);
router.get('/assignees', requirePermission('inquiries.manage'), InquiryController.assignees);

router.get('/', requirePermission('inquiries.view'), validate(ListInquiriesRequest), InquiryController.index);
router.get('/:uuid', requirePermission('inquiries.view'), InquiryController.show);
router.patch('/:uuid/status', requirePermission('inquiries.manage'), validate(UpdateInquiryStatusRequest), InquiryController.updateStatus);
router.patch('/:uuid/assign', requirePermission('inquiries.manage'), validate(AssignInquiryRequest), InquiryController.assign);
router.get('/:uuid/notes', requirePermission('inquiries.view'), InquiryController.notes);
router.post('/:uuid/notes', requirePermission('inquiries.manage'), validate(StoreInquiryNoteRequest), InquiryController.addNote);
router.delete('/:uuid', requirePermission('inquiries.manage'), InquiryController.destroy);

module.exports = router;
