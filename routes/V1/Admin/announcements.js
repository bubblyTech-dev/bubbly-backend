const express = require('express');
const AnnouncementController = require('@app/Controllers/V1/Admin/AnnouncementController');
const requirePermission = require('@app/Middleware/requirePermission');
const validate = require('@app/Middleware/validate');
const ListAnnouncementsRequest = require('@app/Requests/V1/Admin/Announcements/ListAnnouncementsRequest');
const TargetOptionsRequest = require('@app/Requests/V1/Admin/Announcements/TargetOptionsRequest');
const StoreAnnouncementRequest = require('@app/Requests/V1/Admin/Announcements/StoreAnnouncementRequest');
const UpdateAnnouncementRequest = require('@app/Requests/V1/Admin/Announcements/UpdateAnnouncementRequest');

const router = express.Router();

const view = requirePermission('announcements.view');
const manage = requirePermission('announcements.manage');

router.get('/', view, validate(ListAnnouncementsRequest), AnnouncementController.index);
router.get('/target-options', view, validate(TargetOptionsRequest), AnnouncementController.targetOptions);
router.get('/:uuid', view, AnnouncementController.show);
router.post('/', manage, validate(StoreAnnouncementRequest), AnnouncementController.store);
router.patch('/:uuid', manage, validate(UpdateAnnouncementRequest), AnnouncementController.update);
router.post('/:uuid/publish', manage, AnnouncementController.publish);
router.post('/:uuid/unpublish', manage, AnnouncementController.unpublish);
router.delete('/:uuid', manage, AnnouncementController.destroy);

module.exports = router;
