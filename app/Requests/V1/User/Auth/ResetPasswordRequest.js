const Request = require('@app/Requests/Request');

class ResetPasswordRequest extends Request {
  rules() {
    return {
      token: 'required|string|max:200',
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

module.exports = ResetPasswordRequest;
