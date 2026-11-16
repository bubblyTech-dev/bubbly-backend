const Response = require('@app/Helpers/Response');
const School = require('@app/Helpers/school');
const SchoolService = require('@app/Services/V1/User/SchoolService');

const SchoolController = {
  async show(req, res) {
    return Response.success(res, { data: await SchoolService.show(School.ctx(req)) });
  },

  async update(req, res) {
    return Response.success(res, { data: await SchoolService.update(School.ctx(req), req.validated), message: 'School details saved.' });
  },
};

module.exports = SchoolController;
