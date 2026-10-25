const Response = require('@app/Helpers/Response');
const { clientInfo } = require('@app/Helpers/http');
const InquiryService = require('@app/Services/V1/Admin/InquiryService');

// who is doing the action, for the audit log
const auditContext = (req) => ({ admin: req.admin, ...clientInfo(req) });

const InquiryController = {
  async index(req, res) {
    const result = await InquiryService.list(req.admin, req.validated);
    return Response.success(res, { data: result.data, meta: result.meta });
  },

  async show(req, res) {
    return Response.success(res, { data: { inquiry: await InquiryService.show(req.params.uuid) } });
  },

  async counts(req, res) {
    return Response.success(res, { data: await InquiryService.counts() });
  },

  async assignees(req, res) {
    return Response.success(res, { data: await InquiryService.assignees() });
  },

  async updateStatus(req, res) {
    const inquiry = await InquiryService.updateStatus(auditContext(req), req.params.uuid, req.validated);
    return Response.success(res, { data: { inquiry }, message: 'Status updated.' });
  },

  async assign(req, res) {
    const inquiry = await InquiryService.assign(auditContext(req), req.params.uuid, req.validated);
    return Response.success(res, { data: { inquiry }, message: 'Assignment updated.' });
  },

  async notes(req, res) {
    return Response.success(res, { data: await InquiryService.listNotes(req.params.uuid) });
  },

  async addNote(req, res) {
    const note = await InquiryService.addNote(auditContext(req), req.params.uuid, req.validated);
    return Response.created(res, { data: { note }, message: 'Note added.' });
  },

  async destroy(req, res) {
    await InquiryService.remove(auditContext(req), req.params.uuid);
    return Response.success(res, { message: 'Inquiry deleted.' });
  },
};

module.exports = InquiryController;
