const Response = require('@app/Helpers/Response');
const { clientInfo } = require('@app/Helpers/http');
const AnnouncementService = require('@app/Services/V1/Admin/AnnouncementService');

// who is doing it and from where, for the audit log
const context = (req) => ({ admin: req.admin, ...clientInfo(req) });

const AnnouncementController = {
  async index(req, res) {
    const { data, meta } = await AnnouncementService.list(req.validated);
    return Response.success(res, { data, meta });
  },

  // the schools or plans that can be picked as the audience
  async targetOptions(req, res) {
    return Response.success(res, { data: await AnnouncementService.targetOptions(req.validated) });
  },

  async show(req, res) {
    return Response.success(res, { data: await AnnouncementService.show(req.params.uuid) });
  },

  async store(req, res) {
    const data = await AnnouncementService.create(context(req), req.validated);
    return Response.created(res, { data, message: 'Announcement created.' });
  },

  async update(req, res) {
    const data = await AnnouncementService.update(context(req), req.params.uuid, req.validated);
    return Response.success(res, { data, message: 'Announcement updated.' });
  },

  async publish(req, res) {
    const data = await AnnouncementService.publish(context(req), req.params.uuid);
    return Response.success(res, { data, message: 'Announcement published.' });
  },

  async unpublish(req, res) {
    const data = await AnnouncementService.unpublish(context(req), req.params.uuid);
    return Response.success(res, { data, message: 'Announcement unpublished.' });
  },

  async destroy(req, res) {
    await AnnouncementService.remove(context(req), req.params.uuid);
    return Response.success(res, { message: 'Announcement deleted.' });
  },
};

module.exports = AnnouncementController;
