const Request = require('@app/Requests/Request');

// GET /invoices?search=<invoice number or school>&status=&page=&perPage=
class ListInvoicesRequest extends Request {
  source() {
    return 'query';
  }

  rules() {
    return {
      search: 'string|max:100',
      status: 'in:1,2,3,4',
      page: 'integer|min:1',
      perPage: 'integer|min:1|max:100',
    };
  }
}

module.exports = ListInvoicesRequest;
