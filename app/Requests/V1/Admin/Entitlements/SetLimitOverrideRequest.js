const Request = require('@app/Requests/Request');

// PUT /schools/:uuid/entitlements/limits/:limitKey   { value: whole number | null (unlimited), reason }
// `value` must be present in the body (null means unlimited); the service checks that and the range.
class SetLimitOverrideRequest extends Request {
  rules() {
    return {
      value: 'nullable|integer|min:0',
      reason: 'required|string|min:3|max:500',
    };
  }

  messages() {
    return {
      'value.integer': 'The limit must be a whole number, or empty for unlimited.',
      'reason.required': 'Please give a reason for this change.',
      'reason.min': 'The reason must be at least 3 characters.',
    };
  }
}

module.exports = SetLimitOverrideRequest;
