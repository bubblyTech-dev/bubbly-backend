const Request = require('@app/Requests/Request');

// POST /payments/:uuid/refund
//   amountPaise         optional; the full refundable balance when left out (a smaller number is a partial refund)
//   reason              one of the reasons in Settings (billing.refund_reasons)
//   note                optional free text
//   cancelSubscription  true to also end the subscription after the current period
class RefundPaymentRequest extends Request {
  rules() {
    return {
      amountPaise: 'integer|min:1',
      reason: 'required|string|max:100',
      note: 'nullable|string|max:300',
      cancelSubscription: 'boolean',
    };
  }

  attributes() {
    return { amountPaise: 'amount' };
  }

  messages() {
    return { 'reason.required': 'Choose a reason for the refund.' };
  }
}

module.exports = RefundPaymentRequest;
