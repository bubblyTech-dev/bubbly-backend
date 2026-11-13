const Request = require('@app/Requests/Request');

// GET /announcements?search=&status=&type=&page=&perPage=
class ListAnnouncementsRequest extends Request {
  source() {
    return 'query';
  }

  rules() {
    return {
      search: 'string|max:100',
      status: 'in:1,2,3,4',
      type: 'in:1,2,3',
      page: 'integer|min:1',
      perPage: 'integer|min:1|max:100',
    };
  }
}

module.exports = ListAnnouncementsRequest;
