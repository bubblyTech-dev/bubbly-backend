const Request = require('@app/Requests/Request');

// GET /user/teachers?page=&perPage=&search=&status=1|2|all
class ListTeachersRequest extends Request {
  source() {
    return 'query';
  }

  rules() {
    return { page: 'integer', perPage: 'integer', search: 'string|max:100', status: 'in:1,2,3,all' };
  }
}

module.exports = ListTeachersRequest;
