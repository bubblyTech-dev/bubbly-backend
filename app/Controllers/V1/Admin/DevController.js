const AppError = require('@app/Helpers/AppError');
const Response = require('@app/Helpers/Response');
const WebhookIngest = require('@app/Services/V1/Common/Webhooks/WebhookIngest');

// Development helpers. These routes are only mounted when NODE_ENV is not "production" (see routes/V1/Admin/index.js).
const DevController = {
  // POST /dev/webhook-replay { rawBody, signature, eventId? }
  // Feeds a captured webhook through the SAME WebhookIngest the real endpoint uses, including the signature check
  // with the real webhook secret. Copy the raw body character for character and the X-Razorpay-Signature header
  // (and X-Razorpay-Event-Id if you have it) from webhook.site.
  async webhookReplay(req, res) {
    if (!req.admin.isMaster) throw AppError.forbidden();

    // the raw body is taken from the request itself: validation trims text, and the signature covers every byte
    const { rawBody } = req.body;
    const { signature, eventId } = req.validated;
    const result = await WebhookIngest.handle({ rawBody, signature, eventId, source: 'replay' });

    if (result.outcome === 'invalid_signature' || result.outcome === 'bad_body') {
      throw AppError.validation({ rawBody: ['The signature does not match this body. Copy the body exactly as received.'] });
    }
    return Response.success(res, {
      message: result.outcome,
      data: { outcome: result.outcome, eventType: result.event ? result.event.eventType : null, error: result.error ? result.error.message : null },
    });
  },
};

module.exports = DevController;
