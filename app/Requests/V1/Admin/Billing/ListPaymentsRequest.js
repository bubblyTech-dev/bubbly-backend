const Request = require('@app/Requests/Request');

// GET /payments?search=<school, Razorpay id or reference>&source=1|2&status=&subscription=<uuid>&page=&perPage=
class ListPaymentsRequest extends Request {
  source() {
    return 'query';
  }

  rules() {
    return {
      search: 'string|max:100',
      status: 'in:1,2,3,4,5,6',
      source: 'in:1,2',
      subscription: 'uuid',
      page: 'integer|min:1',
      perPage: 'integer|min:1|max:100',
    };
  }
}

module.exports = ListPaymentsRequest;
