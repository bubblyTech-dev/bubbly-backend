# Webhooks (payment provider events)

The endpoint is mounted once, unversioned, at `POST /api/webhooks/payment` (the address is saved in the Razorpay
dashboard). It is the same code in development and in production; only the way events reach it differs.

## Flow

```
Razorpay -> POST /api/webhooks/payment -> WebhookController -> WebhookIngest.handle() -> WebhookProcessor -> handlers/*
```

- `WebhookController` (Controllers/V1/Common) reads the RAW body (`express.raw` in `index.js`, registered before
  `express.json`), the `X-Razorpay-Signature` and the `X-Razorpay-Event-Id` headers.
- `WebhookIngest.handle()` is the ONE entry point. It verifies the signature over the exact bytes, then, in a
  transaction under a lock on the event id, stores the event in `webhook_events` and processes it. The development
  replay calls the same function.
- `WebhookProcessor` routes `event.event` to a handler in `handlers/`. A handler returns `{ outcome, message? }` or
  throws (the event is stored as Failed and Razorpay sends it again).
- `InvoiceIssuer` issues our own GST invoice for a captured payment; `../Provisioning.js` runs when a school's
  subscription first becomes Active (school Active + Principal login through `../PrincipalProvisioner.js`).

## Rules

- The signature is checked first; a wrong one stores and processes nothing (answer 400).
- An event id already Processed or Ignored is answered 200 and not processed again; a Failed one is processed again.
  Two deliveries of the same id at the same moment cannot both run (advisory lock on the event id).
- The processing runs in a savepoint: when it throws, its changes are undone and the event row stays as Failed.
- All events of one subscription are handled one at a time (advisory lock on the subscription), so a charge and its
  payment event can never both create an invoice.
- Events can arrive out of order: an older event never overwrites a newer state, and Cancelled and Expired are final.
- The subscription becomes Active only from a verified event, never from the browser redirect.
- Answers: 200 for anything accepted (new, duplicate, ignored), 400 wrong signature or not an event, 500 only when
  processing failed (so Razorpay retries), 503 when `RAZORPAY_WEBHOOK_SECRET` is not set.

## Handled events

`subscription.authenticated | activated | charged | pending | halted | cancelled | paused | resumed | completed | updated`,
`payment.authorized | captured | failed`, `refund.created | processed`. Anything else is stored as Ignored.
To support another event: add a handler in `handlers/` and list its name in `WebhookProcessor.js`.

## Testing locally

1. Real flow: point the Razorpay webhook at a webhook.site address and forward its requests to the local backend
   with `whcli forward --target=http://localhost:3000/api/webhooks/payment` (original headers and body are kept).
   A tunnel such as Cloudflare Tunnel works the same way.
2. Replay a captured event (development only, master admin): `POST /api/v1/admin/dev/webhook-replay` with
   `{ "rawBody": "<the body copied character for character>", "signature": "<X-Razorpay-Signature>", "eventId": "<X-Razorpay-Event-Id>" }`.
   The route does not exist when `NODE_ENV=production`. The signature is verified with the real webhook secret, so the
   body must be copied exactly (use the "Raw Content" view on webhook.site, not the pretty-printed one).
