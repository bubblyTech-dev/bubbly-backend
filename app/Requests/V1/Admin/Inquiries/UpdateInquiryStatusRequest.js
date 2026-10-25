const Request = require('@app/Requests/Request');

class UpdateInquiryStatusRequest extends Request {
  rules() {
    return {
      status: 'required|in:1,2,3,4',
    };
  }
}

module.exports = UpdateInquiryStatusRequest;
