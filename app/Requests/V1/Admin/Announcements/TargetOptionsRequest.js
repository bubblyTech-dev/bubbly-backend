const Request = require('@app/Requests/Request');

// GET /announcements/target-options?targetType=2&search=
//   targetType 2 = schools, 3 = plans
class TargetOptionsRequest extends Request {
  source() {
    return 'query';
  }

  rules() {
    return {
      targetType: 'required|in:2,3',
      search: 'string|max:100',
    };
  }

  attributes() {
    return { targetType: 'audience' };
  }
}

module.exports = TargetOptionsRequest;
