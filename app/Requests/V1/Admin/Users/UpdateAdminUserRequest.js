const Request = require('@app/Requests/Request');

// Send only what changed. An empty phone clears it.
class UpdateAdminUserRequest extends Request {
  rules() {
    return {
      name: 'string|max:150',
      email: 'email|max:190',
      phone: 'nullable|string|max:30',
    };
  }
}

module.exports = UpdateAdminUserRequest;
