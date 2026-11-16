const Request = require('@app/Requests/Request');

// workingDays: ISO weekdays, for example [1,2,3,4,5]. academicYearStartMonth: 1-12.
class UpdateSchoolRequest extends Request {
  rules() {
    return {
      name: 'string|min:2|max:150',
      contactPhone: 'nullable|string|max:30',
      addressLine1: 'nullable|string|max:200',
      addressLine2: 'nullable|string|max:200',
      city: 'nullable|string|max:100',
      state: 'nullable|string|max:100',
      postalCode: 'nullable|string|max:20',
      workingDays: 'array',
      opensAt: 'nullable|time',
      closesAt: 'nullable|time',
      academicYearStartMonth: 'in:1,2,3,4,5,6,7,8,9,10,11,12',
    };
  }
}

module.exports = UpdateSchoolRequest;
