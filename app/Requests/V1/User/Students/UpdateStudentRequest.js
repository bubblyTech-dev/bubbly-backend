const Request = require('@app/Requests/Request');

// every field is optional; send only what changes
class UpdateStudentRequest extends Request {
  rules() {
    return {
      name: 'string|min:2|max:150',
      admissionNo: 'nullable|string|max:40',
      classUuid: 'nullable|uuid',
      dateOfBirth: 'nullable|date',
      gender: 'nullable|in:1,2,3',
      bloodGroup: 'nullable|in:A+,A-,B+,B-,AB+,AB-,O+,O-',
      address: 'nullable|string|max:300',
      medicalNotes: 'nullable|string|max:2000',
      guardianName: 'nullable|string|max:150',
      guardianRelation: 'nullable|string|max:30',
      guardianPhone: 'nullable|string|max:30',
      guardianEmail: 'nullable|email|max:190',
      secondGuardianName: 'nullable|string|max:150',
      secondGuardianPhone: 'nullable|string|max:30',
      admissionDate: 'nullable|date',
    };
  }
}

module.exports = UpdateStudentRequest;
