const Request = require('@app/Requests/Request');

// Add a school by hand (for example an offline sale).
//   logo               the temp name returned by POST /admin/files/upload?type=clientLogo
//   principalPassword  optional: creates the Principal login now (contact email + this password)
class StoreSchoolRequest extends Request {
  rules() {
    return {
      name: 'required|string|min:2|max:150',
      contactName: 'string|max:150',
      contactEmail: 'email|max:190',
      contactPhone: 'string|max:30',
      addressLine1: 'string|max:200',
      addressLine2: 'string|max:200',
      city: 'string|max:100',
      state: 'string|max:100',
      postalCode: 'string|max:20',
      country: 'string|max:100',
      gstNumber: 'string|max:20',
      timezone: 'string|max:60',
      logo: 'string|max:120',
      principalPassword: 'password',
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
      principalPassword: 'Principal password',
    };
  }
}

module.exports = StoreSchoolRequest;
