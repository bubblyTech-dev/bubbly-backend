const Request = require('@app/Requests/Request');

// Send only what changed. An empty optional value clears it (nullable). The name cannot be emptied.
//   logo         the temp name returned by POST /admin/files/upload?type=clientLogo
//   removeLogo   true to delete the current logo
class UpdateSchoolRequest extends Request {
  rules() {
    return {
      name: 'string|min:2|max:150',
      contactName: 'nullable|string|max:150',
      contactEmail: 'nullable|email|max:190',
      contactPhone: 'nullable|string|max:30',
      addressLine1: 'nullable|string|max:200',
      addressLine2: 'nullable|string|max:200',
      city: 'nullable|string|max:100',
      state: 'nullable|string|max:100',
      postalCode: 'nullable|string|max:20',
      country: 'nullable|string|max:100',
      gstNumber: 'nullable|string|max:20',
      timezone: 'string|max:60',
      logo: 'string|max:120',
      removeLogo: 'boolean',
    };
  }

  attributes() {
    return {
      name: 'school name',
      contactName: 'contact name',
      contactEmail: 'contact email',
      contactPhone: 'contact phone',
      addressLine1: 'address line 1',
      addressLine2: 'address line 2',
      postalCode: 'postal code',
      gstNumber: 'GST number',
    };
  }
}

module.exports = UpdateSchoolRequest;
