const Request = require('@app/Requests/Request');

// assignedTo: a staff uuid, or null to remove the assignment
class AssignInquiryRequest extends Request {
  rules() {
    return {
      assignedTo: 'nullable|uuid',
    };
  }

  attributes() {
    return { assignedTo: 'staff member' };
  }
}

module.exports = AssignInquiryRequest;
