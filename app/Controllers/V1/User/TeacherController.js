const Response = require('@app/Helpers/Response');
const School = require('@app/Helpers/school');
const TeacherService = require('@app/Services/V1/User/TeacherService');

const TeacherController = {
  async index(req, res) {
    const { data, meta } = await TeacherService.list(School.ctx(req), req.validated);
    return Response.success(res, { data, meta });
  },

  async options(req, res) {
    return Response.success(res, { data: await TeacherService.options(School.ctx(req)) });
  },

  async show(req, res) {
    return Response.success(res, { data: await TeacherService.show(School.ctx(req), req.params.uuid) });
  },

  // data: { teacher, setPasswordUrl }
  async store(req, res) {
    return Response.created(res, { data: await TeacherService.create(School.ctx(req), req.validated), message: 'Teacher added.' });
  },

  async update(req, res) {
    return Response.success(res, { data: await TeacherService.update(School.ctx(req), req.params.uuid, req.validated), message: 'Teacher updated.' });
  },

  async changeStatus(req, res) {
    return Response.success(res, { data: await TeacherService.changeStatus(School.ctx(req), req.params.uuid, req.validated), message: 'Status changed.' });
  },

  async sendLoginLink(req, res) {
    return Response.success(res, { data: await TeacherService.sendLoginLink(School.ctx(req), req.params.uuid), message: 'A new login link was created.' });
  },

  async markAttendance(req, res) {
    return Response.success(res, { data: await TeacherService.markAttendance(School.ctx(req), req.params.uuid, req.validated), message: 'Attendance saved.' });
  },
};

module.exports = TeacherController;
