const express = require('express');
const PlanController = require('@app/Controllers/V1/Admin/PlanController');
const validate = require('@app/Middleware/validate');
const requirePermission = require('@app/Middleware/requirePermission');
const ListPlansRequest = require('@app/Requests/V1/Admin/Plans/ListPlansRequest');
const StorePlanRequest = require('@app/Requests/V1/Admin/Plans/StorePlanRequest');
const UpdatePlanRequest = require('@app/Requests/V1/Admin/Plans/UpdatePlanRequest');

const router = express.Router();

// inside the admin group, so the admin is already signed in
router.get('/options', requirePermission('plans.view'), PlanController.options); // before /:uuid
router.get('/', requirePermission('plans.view'), validate(ListPlansRequest), PlanController.index);
router.post('/', requirePermission('plans.create'), validate(StorePlanRequest), PlanController.store);
router.get('/:uuid', requirePermission('plans.view'), PlanController.show);
router.patch('/:uuid', requirePermission('plans.edit'), validate(UpdatePlanRequest), PlanController.update);
router.post('/:uuid/publish', requirePermission('plans.publish'), PlanController.publish);
router.post('/:uuid/sync-gateway', requirePermission('plans.publish'), PlanController.syncGateway);
router.post('/:uuid/archive', requirePermission('plans.archive'), PlanController.archive);
router.post('/:uuid/duplicate', requirePermission('plans.create'), PlanController.duplicate);
router.delete('/:uuid', requirePermission('plans.archive'), PlanController.destroy);

module.exports = router;
