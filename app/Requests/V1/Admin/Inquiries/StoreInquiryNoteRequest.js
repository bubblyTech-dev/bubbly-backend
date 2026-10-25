const Request = require('@app/Requests/Request');

class StoreInquiryNoteRequest extends Request {
  rules() {
    return {
      note: 'required|string|max:2000',
    };
  }
}

module.exports = StoreInquiryNoteRequest;
