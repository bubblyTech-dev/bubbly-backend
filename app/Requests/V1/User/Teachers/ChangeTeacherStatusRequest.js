const Request = require('@app/Requests/Request');

// 1: Active, 2: Inactive
class ChangeTeacherStatusRequest extends Request {
  rules() {
    return { status: 'required|in:1,2' };
  }
}

module.exports = ChangeTeacherStatusRequest;
