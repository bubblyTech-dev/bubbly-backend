const Request = require('@app/Requests/Request');

// GET /schools?search=&status=&page=&perPage=
class ListSchoolsRequest extends Request {
  source() {
    return 'query';
  }

  rules() {
    return {
      search: 'string|max:100',
      status: 'in:1,2,3',
      page: 'integer',
      perPage: 'integer',
    };
  }
}

module.exports = ListSchoolsRequest;
