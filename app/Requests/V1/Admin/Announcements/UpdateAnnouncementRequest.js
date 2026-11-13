const Request = require('@app/Requests/Request');

// Send only what changed. What may change depends on the status (checked in the service).
class UpdateAnnouncementRequest extends Request {
  rules() {
    return {
      title: 'string|max:200',
      body: 'string|max:10000',
      type: 'in:1,2,3',
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

module.exports = UpdateAnnouncementRequest;
