const Response = require('@app/Helpers/Response');
const { clientInfo } = require('@app/Helpers/http');
const PlanService = require('@app/Services/V1/Admin/PlanService');

// who is doing it and from where (for created_by and the audit log)
const contextOf = (req) => ({ admin: req.admin, ...clientInfo(req) });

const PlanController = {
  async options(req, res) {
    return Response.success(res, { data: await PlanService.options() });
  },

  async index(req, res) {
    const { data, meta } = await PlanService.list(req.validated);
    return Response.success(res, { data, meta });
  },

  async show(req, res) {
    return Response.success(res, { data: { plan: await PlanService.show(req.params.uuid) } });
  },

  async store(req, res) {
    const plan = await PlanService.create(contextOf(req), req.validated);
    return Response.created(res, { data: { plan }, message: 'Plan created.' });
  },

  async update(req, res) {
    const plan = await PlanService.update(contextOf(req), req.params.uuid, req.validated);
    return Response.success(res, { data: { plan }, message: 'Plan updated.' });
  },

  async publish(req, res) {
    const plan = await PlanService.publish(contextOf(req), req.params.uuid);
    return Response.success(res, { data: { plan }, message: 'Plan published.' });
  },

  async syncGateway(req, res) {
    const plan = await PlanService.syncGateway(contextOf(req), req.params.uuid);
    return Response.success(res, { data: { plan }, message: 'Plan is on Razorpay.' });
  },

  async archive(req, res) {
    const plan = await PlanService.archive(contextOf(req), req.params.uuid);
    return Response.success(res, { data: { plan }, message: 'Plan archived.' });
  },

  async duplicate(req, res) {
    const plan = await PlanService.duplicate(contextOf(req), req.params.uuid);
    return Response.created(res, { data: { plan }, message: 'Plan duplicated as a new draft.' });
  },

  async destroy(req, res) {
    await PlanService.remove(contextOf(req), req.params.uuid);
    return Response.success(res, { message: 'Plan deleted.' });
  },
};

module.exports = PlanController;
