const Request = require('@app/Requests/Request');

class ForgotPasswordRequest extends Request {
  rules() {
    return { email: 'required|email' };
  }

  messages() {
    return { 'email.required': 'Please enter your email.', 'email.email': 'Please enter a valid email address.' };
  }
}

module.exports = ForgotPasswordRequest;
