const Request = require('@app/Requests/Request');

// every field is optional; classUuids replaces the whole set of classes when sent
class UpdateTeacherRequest extends Request {
  rules() {
    return {
      name: 'string|min:2|max:150',
      email: 'email|max:190',
      phone: 'nullable|string|max:30',
      designation: 'nullable|string|max:60',
      employeeCode: 'nullable|string|max:30',
      qualification: 'nullable|string|max:200',
      experienceYears: 'nullable|numeric',
      joiningDate: 'nullable|date',
      dateOfBirth: 'nullable|date',
      gender: 'nullable|in:1,2,3',
      emergencyContact: 'nullable|string|max:30',
      address: 'nullable|string|max:300',
      shiftStartsAt: 'nullable|time',
      shiftEndsAt: 'nullable|time',
      annualLeaveQuota: 'nullable|integer',
      classUuids: 'array',
    };
  }
}

module.exports = UpdateTeacherRequest;
