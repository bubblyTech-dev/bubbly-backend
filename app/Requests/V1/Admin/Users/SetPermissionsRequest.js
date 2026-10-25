const Request = require('@app/Requests/Request');

// The full list of permission keys the staff member should have (an empty list removes them all).
class SetPermissionsRequest extends Request {
  rules() {
    return { permissions: 'required|array' };
  }
}

module.exports = SetPermissionsRequest;
