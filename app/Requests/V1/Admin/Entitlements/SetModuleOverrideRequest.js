const Request = require('@app/Requests/Request');

// PUT /schools/:uuid/entitlements/modules/:moduleUuid   { access: 'grant' | 'revoke', reason }
class SetModuleOverrideRequest extends Request {
  rules() {
    return {
      access: 'required|in:grant,revoke',
      reason: 'required|string|min:3|max:500',
    };
  }

  messages() {
    return {
      'access.required': 'Choose grant (switch on) or revoke (switch off).',
      'access.in': 'Choose grant (switch on) or revoke (switch off).',
      'reason.required': 'Please give a reason for this change.',
      'reason.min': 'The reason must be at least 3 characters.',
    };
  }
}

module.exports = SetModuleOverrideRequest;
