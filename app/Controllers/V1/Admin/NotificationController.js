const Response = require('@app/Helpers/Response');
const NotificationService = require('@app/Services/V1/Admin/NotificationService');

const NotificationController = {
  async index(req, res) {
    return Response.success(res, { data: await NotificationService.list(req.admin) });
  },

  async seen(req, res) {
    return Response.success(res, { data: await NotificationService.markSeen(req.admin), message: 'Marked as read.' });
  },
};

module.exports = NotificationController;
