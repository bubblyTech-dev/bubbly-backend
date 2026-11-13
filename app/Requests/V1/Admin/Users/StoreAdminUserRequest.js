const Request = require('@app/Requests/Request');

// Adds a staff member. The first password must be changed at the first login.
// status: 1 Active (default), 2 Inactive. permissions: list of permission keys (optional).
class StoreAdminUserRequest extends Request {
  rules() {
    return {
      name: 'required|string|max:150',
      email: 'required|email|max:190',
      phone: 'nullable|string|max:30',
      password: 'required|password',
      passwordConfirmation: 'required|same:password',
      status: 'in:1,2',
      permissions: 'array',
    };
  }

  attributes() {
    return { passwordConfirmation: 'password confirmation' };
  }

  messages() {
    return { 'passwordConfirmation.same': 'The two passwords do not match.' };
  }
}

module.exports = StoreAdminUserRequest;
