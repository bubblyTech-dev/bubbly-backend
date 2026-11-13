const Request = require('@app/Requests/Request');

// DELETE /schools/:uuid/entitlements/modules/:moduleUuid and .../limits/:limitKey   { reason } (optional)
class ClearOverrideRequest extends Request {
  rules() {
    return {
      reason: 'nullable|string|max:500',
    };
  }
}

module.exports = ClearOverrideRequest;
