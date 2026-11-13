const payment = require('@config/payment');
const Response = require('@app/Helpers/Response');
const WebhookIngest = require('@app/Services/V1/Common/Webhooks/WebhookIngest');

// POST /api/webhooks/payment  (not versioned: the address is saved in the Razorpay dashboard)
//
// The route reads the body RAW (see index.js): the signature is an HMAC of the exact bytes Razorpay sent, so the
// body must not be parsed and re-written before it is checked. Everything else happens in WebhookIngest.
//
// Answers: 200 for anything accepted (new, duplicate or ignored event), 400 for a wrong signature or a body that is
// not an event, 500 only when processing failed (Razorpay then sends the event again), 503 when the secret is not set.

// a small in-memory brake on wrong signatures, per address (anyone can call a public endpoint)
const WINDOW_MS = 60000;
const MAX_BAD_PER_WINDOW = 20;
const bad = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of bad) if (entry.resetAt <= now) bad.delete(ip);
}, WINDOW_MS).unref();

const tooManyBad = (ip) => {
  const entry = bad.get(ip);
  return Boolean(entry && entry.resetAt > Date.now() && entry.count >= MAX_BAD_PER_WINDOW);
};

const countBad = (ip) => {
  const now = Date.now();
  const entry = bad.get(ip);
  if (!entry || entry.resetAt <= now) bad.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  else entry.count += 1;
};

const WebhookController = {
  async payment(req, res) {
    if (!payment.webhookSecret) {
      return Response.error(res, { status: 503, message: 'The webhook is not set up.', code: 'WEBHOOK_NOT_CONFIGURED' });
    }
    if (tooManyBad(req.ip)) {
      return Response.error(res, { status: 429, message: 'Too many invalid requests.', code: 'TOO_MANY_REQUESTS' });
    }

    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const result = await WebhookIngest.handle({
      rawBody,
      signature: req.get('x-razorpay-signature'),
      eventId: req.get('x-razorpay-event-id'),
    });

    if (result.outcome === 'invalid_signature' || result.outcome === 'bad_body') {
      countBad(req.ip);
      return Response.error(res, { status: 400, message: 'The request could not be verified.', code: 'INVALID_WEBHOOK' });
    }
    if (result.outcome === 'failed') {
      return Response.error(res, { status: 500, message: 'The event could not be processed.', code: 'WEBHOOK_PROCESSING_FAILED' });
    }
    return Response.success(res, { message: result.outcome });
  },
};

module.exports = WebhookController;
