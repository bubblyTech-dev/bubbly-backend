const Response = require('@app/Helpers/Response');
const School = require('@app/Helpers/school');
const ClassService = require('@app/Services/V1/User/ClassService');

const ClassController = {
  async index(req, res) {
    const { data, meta } = await ClassService.list(School.ctx(req), req.validated);
    return Response.success(res, { data, meta });
  },

  async options(req, res) {
    return Response.success(res, { data: await ClassService.options(School.ctx(req)) });
  },

  async show(req, res) {
    return Response.success(res, { data: await ClassService.show(School.ctx(req), req.params.uuid) });
  },

  async store(req, res) {
    return Response.created(res, { data: await ClassService.create(School.ctx(req), req.validated), message: 'Class added.' });
  },

  async update(req, res) {
    return Response.success(res, { data: await ClassService.update(School.ctx(req), req.params.uuid, req.validated), message: 'Class updated.' });
  },

  async destroy(req, res) {
    await ClassService.destroy(School.ctx(req), req.params.uuid);
    return Response.success(res, { message: 'Class deleted.' });
  },
};

module.exports = ClassController;
