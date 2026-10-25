const Request = require('@app/Requests/Request');

// The public contact / demo form. `website` is a hidden trap field: people leave it empty, bots fill it in.
class StoreInquiryRequest extends Request {
  rules() {
    return {
      name: 'required|string|max:150',
      email: 'required|email|max:190',
      phone: 'string|max:30',
      schoolName: 'string|max:190',
      message: 'required|string|max:2000',
      source: 'in:1,2,3',
      website: 'string|max:200',
    };
  }

  attributes() {
    return { schoolName: 'school name' };
  }

  messages() {
    return {
      'name.required': 'Please enter your name.',
      'email.required': 'Please enter your email.',
      'email.email': 'Please enter a valid email address.',
      'message.required': 'Please write your message.',
    };
  }
}

module.exports = StoreInquiryRequest;
