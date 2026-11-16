const Response = require('@app/Helpers/Response');
const School = require('@app/Helpers/school');
const StudentService = require('@app/Services/V1/User/StudentService');

const StudentController = {
  async index(req, res) {
    const { data, meta } = await StudentService.list(School.ctx(req), req.validated);
    return Response.success(res, { data, meta });
  },

  async show(req, res) {
    return Response.success(res, { data: await StudentService.show(School.ctx(req), req.params.uuid) });
  },

  // data: { student, setPasswordUrl } (the link only when a parent login was created)
  async store(req, res) {
    return Response.created(res, { data: await StudentService.create(School.ctx(req), req.validated), message: 'Student added.' });
  },

  async update(req, res) {
    return Response.success(res, { data: await StudentService.update(School.ctx(req), req.params.uuid, req.validated), message: 'Student updated.' });
  },

  async changeStatus(req, res) {
    return Response.success(res, { data: await StudentService.changeStatus(School.ctx(req), req.params.uuid, req.validated), message: 'Status changed.' });
  },

  async parentLogin(req, res) {
    return Response.success(res, {
      data: await StudentService.parentLogin(School.ctx(req), req.params.uuid),
      message: 'A login link was created for the parent.',
    });
  },

  async destroy(req, res) {
    await StudentService.destroy(School.ctx(req), req.params.uuid);
    return Response.success(res, { message: 'Student deleted.' });
  },
};

module.exports = StudentController;
