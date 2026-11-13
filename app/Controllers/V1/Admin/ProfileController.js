const Response = require('@app/Helpers/Response');
const ProfileService = require('@app/Services/V1/Admin/ProfileService');

const ProfileController = {
  async update(req, res) {
    const user = await ProfileService.update(req.admin, req.validated);
    return Response.success(res, { data: { user }, message: 'Profile updated.' });
  },
};

module.exports = ProfileController;
