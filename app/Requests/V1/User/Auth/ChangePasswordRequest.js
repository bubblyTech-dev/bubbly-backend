const Request = require('@app/Requests/Request');

class ChangePasswordRequest extends Request {
  rules() {
    return {
      currentPassword: 'required|string|max:128',
      newPassword: 'required|password',
      newPasswordConfirmation: 'required|same:newPassword',
    };
  }

  attributes() {
    return { currentPassword: 'current password', newPassword: 'new password', newPasswordConfirmation: 'password confirmation' };
  }

  messages() {
    return { 'newPasswordConfirmation.same': 'The two passwords do not match.' };
  }
}

module.exports = ChangePasswordRequest;
