const Request = require('@app/Requests/Request');

// 1: Active, 2: Inactive, 3: Left
class ChangeStudentStatusRequest extends Request {
  rules() {
    return { status: 'required|in:1,2,3' };
  }
}

module.exports = ChangeStudentStatusRequest;
