const Request = require('@app/Requests/Request');

class StoreClassRequest extends Request {
  rules() {
    return {
      name: 'required|string|min:1|max:100',
      code: 'nullable|string|max:30',
      room: 'nullable|string|max:60',
      startsAt: 'nullable|time',
      endsAt: 'nullable|time',
      capacity: 'nullable|integer',
      classTeacherUuid: 'nullable|uuid',
      sortOrder: 'integer',
    };
  }

  messages() {
    return { 'name.required': 'Please enter the class name.' };
  }
}

module.exports = StoreClassRequest;
