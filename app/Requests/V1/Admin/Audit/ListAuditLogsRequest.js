const Request = require('@app/Requests/Request');

// GET /admin/audit-logs?search=&action=&entityType=&from=&to=&page=&perPage=
// action matches the start of the action name (for example "admin_user" or "admin_user.created").
class ListAuditLogsRequest extends Request {
  source() {
    return 'query';
  }

  rules() {
    return {
      search: 'string|max:100',
      action: 'string|max:100',
      entityType: 'string|max:60',
      from: 'date',
      to: 'date',
      page: 'integer',
      perPage: 'integer',
    };
  }
}

module.exports = ListAuditLogsRequest;
