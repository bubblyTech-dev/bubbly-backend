const Request = require('@app/Requests/Request');

// GET /user/students?page=&perPage=&classUuid=&search=&status=1|2|3|all
class ListStudentsRequest extends Request {
  source() {
    return 'query';
  }

  rules() {
    return { page: 'integer', perPage: 'integer', classUuid: 'uuid', search: 'string|max:100', status: 'in:1,2,3,all' };
  }
}

module.exports = ListStudentsRequest;
