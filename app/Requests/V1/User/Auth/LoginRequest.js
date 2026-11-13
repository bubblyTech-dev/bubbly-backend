const Request = require('@app/Requests/Request');

class LoginRequest extends Request {
  rules() {
    return {
      email: 'required|email',
      password: 'required|string|max:128',
    };
  }

  messages() {
    return {
      'email.required': 'Please enter your email.',
      'email.email': 'Please enter a valid email address.',
      'password.required': 'Please enter your password.',
    };
  }
}

module.exports = LoginRequest;
