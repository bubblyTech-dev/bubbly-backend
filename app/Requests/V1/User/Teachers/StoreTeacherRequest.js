const Request = require('@app/Requests/Request');

// classUuids: the classes this teacher becomes class teacher of (optional)
class StoreTeacherRequest extends Request {
  rules() {
    return {
      name: 'required|string|min:2|max:150',
      email: 'required|email|max:190',
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

  messages() {
    return { 'name.required': 'Please enter the teacher name.', 'email.required': 'Please enter the email: it is their login.' };
  }
}

module.exports = StoreTeacherRequest;
