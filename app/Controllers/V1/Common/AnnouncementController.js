const Response = require('@app/Helpers/Response');
const AnnouncementService = require('@app/Services/V1/Admin/AnnouncementService');

const AnnouncementController = {
  // for the School app: what to show right now
  async active(req, res) {
    return Response.success(res, { data: await AnnouncementService.active() });
  },
};

module.exports = AnnouncementController;
