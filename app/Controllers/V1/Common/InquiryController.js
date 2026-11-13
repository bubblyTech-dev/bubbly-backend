const Response = require('@app/Helpers/Response');
const { clientInfo } = require('@app/Helpers/http');
const InquiryService = require('@app/Services/V1/Common/InquiryService');

const InquiryController = {
  async store(req, res) {
    await InquiryService.submit(req.validated, clientInfo(req));
    return Response.success(res, {
      message: 'Thank you! We have received your message and will get back to you soon.',
    });
  },
};

module.exports = InquiryController;
