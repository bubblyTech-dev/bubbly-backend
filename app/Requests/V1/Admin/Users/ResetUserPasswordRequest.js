const Request = require('@app/Requests/Request');

// Sets a new password for a staff member. They must change it again at the next login.
class ResetUserPasswordRequest extends Request {
  rules() {
    return {
      password: 'required|password',
      passwordConfirmation: 'required|same:password',
    };
  }

  attributes() {
    return { passwordConfirmation: 'password confirmation' };
  }

  messages() {
    return { 'passwordConfirmation.same': 'The two passwords do not match.' };
  }
}

module.exports = ResetUserPasswordRequest;
