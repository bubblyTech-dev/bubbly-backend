const Request = require('@app/Requests/Request');

// GET /renewals?tab=due_soon|payment_failed|in_grace|suspended&search=&page=&perPage=
class ListRenewalsRequest extends Request {
  source() {
    return 'query';
  }

  rules() {
    return {
      tab: 'in:due_soon,payment_failed,in_grace,suspended',
      search: 'string|max:100',
      page: 'integer|min:1',
      perPage: 'integer|min:1|max:100',
    };
  }

  messages() {
    return { 'tab.in': 'Choose due soon, payment failed, in grace or suspended.' };
  }
}

module.exports = ListRenewalsRequest;
