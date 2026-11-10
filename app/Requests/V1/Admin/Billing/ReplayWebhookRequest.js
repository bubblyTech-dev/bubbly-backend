const Request = require('@app/Requests/Request');

// POST /dev/webhook-replay  { rawBody, signature, eventId? }   (development only)
class ReplayWebhookRequest extends Request {
  rules() {
    return {
      rawBody: 'required|string',
      signature: 'required|string|max:200',
      eventId: 'string|max:80',
    };
  }

  attributes() {
    return { rawBody: 'raw body' };
  }
}

module.exports = ReplayWebhookRequest;
