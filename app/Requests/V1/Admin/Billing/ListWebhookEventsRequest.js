const Request = require('@app/Requests/Request');

// GET /webhook-events?search=<event id>&status=&type=<event type>&page=&perPage=
class ListWebhookEventsRequest extends Request {
  source() {
    return 'query';
  }

  rules() {
    return {
      search: 'string|max:100',
      status: 'in:1,2,3,4',
      type: 'string|max:80',
      page: 'integer|min:1',
      perPage: 'integer|min:1|max:100',
    };
  }
}

module.exports = ListWebhookEventsRequest;
