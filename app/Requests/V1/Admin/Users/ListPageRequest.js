const Request = require('@app/Requests/Request');

// ?page=&perPage= (login history and other simple lists)
class ListPageRequest extends Request {
  source() {
    return 'query';
  }

  rules() {
    return {
      page: 'integer',
      perPage: 'integer',
    };
  }
}

module.exports = ListPageRequest;
