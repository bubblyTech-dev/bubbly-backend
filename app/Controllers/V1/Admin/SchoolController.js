const Response = require('@app/Helpers/Response');
const { clientInfo } = require('@app/Helpers/http');
const SchoolService = require('@app/Services/V1/Admin/SchoolService');

// who is acting and from where, for the audit log
const contextOf = (req) => ({ admin: req.admin, ...clientInfo(req) });

const SchoolController = {
  async index(req, res) {
    const result = await SchoolService.list(req.validated);
    return Response.success(res, { data: result.data, meta: result.meta });
  },

  async show(req, res) {
    return Response.success(res, { data: { school: await SchoolService.show(req.params.uuid) } });
  },

  async store(req, res) {
    const school = await SchoolService.create(req.validated, contextOf(req));
    return Response.created(res, { data: { school }, message: 'School added.' });
  },

  async update(req, res) {
    const school = await SchoolService.update(req.params.uuid, req.validated, contextOf(req));
    return Response.success(res, { data: { school }, message: 'School updated.' });
  },

  async changeStatus(req, res) {
    const school = await SchoolService.changeStatus(req.params.uuid, req.validated, contextOf(req));
    return Response.success(res, { data: { school }, message: 'Status changed.' });
  },

  async statusHistory(req, res) {
    const result = await SchoolService.statusHistory(req.params.uuid, req.validated);
    return Response.success(res, { data: result.data, meta: result.meta });
  },

  async notes(req, res) {
    const result = await SchoolService.notes(req.params.uuid, req.validated);
    return Response.success(res, { data: result.data, meta: result.meta });
  },

  async addNote(req, res) {
    const note = await SchoolService.addNote(req.params.uuid, req.validated, contextOf(req));
    return Response.created(res, { data: { note }, message: 'Note added.' });
  },

  async destroy(req, res) {
    await SchoolService.remove(req.params.uuid, contextOf(req));
    return Response.success(res, { message: 'School deleted.' });
  },

  async usage(req, res) {
    return Response.success(res, { data: { usage: await SchoolService.usage(req.params.uuid) } });
  },
};

module.exports = SchoolController;
