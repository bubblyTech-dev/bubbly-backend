const Request = require('@app/Requests/Request');

// Reads the query string: /inquiries?search=&status=&source=&assignedTo=me&page=1&perPage=15
class ListInquiriesRequest extends Request {
  source() {
    return 'query';
  }

  rules() {
    return {
      search: 'string|max:100',
      status: 'in:1,2,3,4',
      source: 'in:1,2,3',
      assignedTo: 'string|max:40', // "me" or a staff uuid, checked in the service
      page: 'integer|min:1',
      perPage: 'integer|min:1|max:100',
    };
  }
}

module.exports = ListInquiriesRequest;
