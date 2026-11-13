const Request = require('@app/Requests/Request');

// targetUuids (schools or plans) is only used when targetType is 2 or 3; the service checks it.
class StoreAnnouncementRequest extends Request {
  rules() {
    return {
      title: 'required|string|max:200',
      body: 'required|string|max:10000',
      type: 'required|in:1,2,3',
      targetType: 'in:1,2,3',
      startsAt: 'nullable|datetime',
      endsAt: 'nullable|datetime',
      targetUuids: 'nullable',
    };
  }

  attributes() {
    return { targetType: 'audience', startsAt: 'start time', endsAt: 'end time', targetUuids: 'audience' };
  }
}

module.exports = StoreAnnouncementRequest;
