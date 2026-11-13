const Request = require('@app/Requests/Request');

// POST /subscriptions/:uuid/expiry   { validUntil: 'YYYY-MM-DD' }  (offline subscriptions only)
class ChangeExpiryRequest extends Request {
  rules() {
    return { validUntil: 'required|date' };
  }

  attributes() {
    return { validUntil: 'valid-until date' };
  }
}

module.exports = ChangeExpiryRequest;
