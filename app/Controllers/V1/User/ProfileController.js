const Response = require('@app/Helpers/Response');
const School = require('@app/Helpers/school');
const ProfileService = require('@app/Services/V1/User/ProfileService');

const ProfileController = {
  async show(req, res) {
    return Response.success(res, { data: await ProfileService.show(School.ctx(req)) });
  },

  async update(req, res) {
    return Response.success(res, { data: await ProfileService.update(School.ctx(req), req.validated), message: 'Profile saved.' });
  },
};

module.exports = ProfileController;
