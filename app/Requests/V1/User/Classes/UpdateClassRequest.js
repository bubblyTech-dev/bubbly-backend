const Request = require('@app/Requests/Request');

// every field is optional; send only what changes. classTeacherUuid: null removes the class teacher.
class UpdateClassRequest extends Request {
  rules() {
    return {
      name: 'string|min:1|max:100',
      code: 'nullable|string|max:30',
      room: 'nullable|string|max:60',
      startsAt: 'nullable|time',
      endsAt: 'nullable|time',
      capacity: 'nullable|integer',
      classTeacherUuid: 'nullable|uuid',
      sortOrder: 'integer',
      status: 'in:1,2',
    };
  }
}

module.exports = UpdateClassRequest;
