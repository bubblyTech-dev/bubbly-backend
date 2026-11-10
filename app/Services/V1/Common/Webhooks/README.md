# Webhooks (built later)

This folder will hold one handler per payment-provider event, for example `subscription.activated` and
`subscription.charged`. The webhook endpoint itself is mounted once, unversioned, at `/api/webhooks/payment`.

Already prepared:

- the `webhook_events` table (every call is stored before it is processed)
- `RazorpayService.verifyWebhookSignature(rawBody, signature)` in `../PaymentGateway`
- `RAZORPAY_WEBHOOK_SECRET` in `.env`

Rules the handlers must follow:

- verify the signature on the raw body first, store the event, then process it
- skip an event id that was already processed (checked in code, inside a transaction with a row lock)
- the subscription becomes Active only from a verified event, never from the browser redirect
