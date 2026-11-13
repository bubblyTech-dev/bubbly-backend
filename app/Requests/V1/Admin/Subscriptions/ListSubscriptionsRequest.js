const Request = require('@app/Requests/Request');

// GET /subscriptions?search=&status=&plan=<plan uuid>&page=&perPage=
class ListSubscriptionsRequest extends Request {
  source() {
    return 'query';
  }

  rules() {
    return {
      search: 'string|max:100',
      status: 'in:1,2,3,4,5,6',
      plan: 'uuid',
      page: 'integer|min:1',
      perPage: 'integer|min:1|max:100',
    };
  }
}

module.exports = ListSubscriptionsRequest;
