const Request = require('@app/Requests/Request');

class ListPlansRequest extends Request {
  source() {
    return 'query';
  }

  rules() {
    return {
      search: 'string|max:100',
      status: 'in:1,2,3',
      page: 'integer|min:1',
      perPage: 'integer|min:1|max:100',
    };
  }
}

module.exports = ListPlansRequest;
