const Request = require('@app/Requests/Request');

// POST /payments/offline
//   schoolUuid, planUuid    the school and the plan it paid for
//   amountPaise             what was received, in paise (GST is taken out of it by the plan's tax setting)
//   paidAt                  the day the money arrived (YYYY-MM-DD)
//   method                  one of the Offline payment methods in Settings
//   validUntil              the last day the school may use the product (YYYY-MM-DD), decided by the admin
class RecordOfflinePaymentRequest extends Request {
  rules() {
    return {
      schoolUuid: 'required|uuid',
      planUuid: 'required|uuid',
      amountPaise: 'required|integer',
      paidAt: 'required|date',
      method: 'required|string|max:30',
      reference: 'nullable|string|max:120',
      validUntil: 'required|date',
      notes: 'nullable|string|max:500',
    };
  }

  attributes() {
    return {
      schoolUuid: 'school',
      planUuid: 'plan',
      amountPaise: 'amount',
      paidAt: 'payment date',
      validUntil: 'valid-until date',
    };
  }
}

module.exports = RecordOfflinePaymentRequest;
