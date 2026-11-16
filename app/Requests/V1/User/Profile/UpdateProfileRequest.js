const Request = require('@app/Requests/Request');

class UpdateProfileRequest extends Request {
  rules() {
    return { name: 'string|min:2|max:150', phone: 'nullable|string|max:30' };
  }
}

module.exports = UpdateProfileRequest;
