const Request = require('@app/Requests/Request');

// date defaults to today (school time zone). status: 1 Present, 2 Absent, 3 Late, 4 On leave, 5 Half day
class MarkStaffAttendanceRequest extends Request {
  rules() {
    return { date: 'date', status: 'required|in:1,2,3,4,5', note: 'nullable|string|max:200' };
  }
}

module.exports = MarkStaffAttendanceRequest;
