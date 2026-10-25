const Request = require('@app/Requests/Request');

// 1: Active (reactivate), 2: Suspended, 3: Archived. A reason is always required and is kept in the history.
class ChangeStatusRequest extends Request {
  rules() {
    return {
      status: 'required|in:1,2,3',
      reason: 'required|string|min:3|max:500',
    };
  }

  messages() {
    return {
      'status.required': 'Please choose the new status.',
      'status.in': 'The new status is not valid.',
      'reason.required': 'Please give a reason. It is saved in the history.',
      'reason.min': 'The reason must be at least 3 characters.',
    };
  }
}

module.exports = ChangeStatusRequest;
