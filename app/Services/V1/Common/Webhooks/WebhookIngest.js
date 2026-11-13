const crypto = require('crypto');
const AppError = require('@app/Helpers/AppError');
const Audit = require('@app/Helpers/audit');
const { sequelize } = require('@app/Helpers/database');
const { WEBHOOK_EVENT_STATUS } = require('@app/Helpers/constants');
const { WebhookEvent } = require('@app/Models');
const Razorpay = require('@app/Services/V1/Common/PaymentGateway/RazorpayService');
const WebhookProcessor = require('./WebhookProcessor');
const { lock } = require('./handlers/shared');

// The ONE entry point for a payment-provider event. The real endpoint (POST /api/webhooks/payment) and the
// development replay both call handle(), so a replayed event behaves exactly like a real one:
//
//   1. the signature is verified over the exact raw body (a wrong one stores and processes nothing)
//   2. the event id is taken from the X-Razorpay-Event-Id header
//   3. in a transaction, under a lock on the event id, the event is stored and processed:
//        - an id that was already Processed or Ignored is answered 200 and not processed again
//        - an id that Failed before is processed again (attempts goes up)
//        - two deliveries of the same id at the same moment cannot both run (the second waits, then sees the first)
//   4. the processing runs inside a savepoint: if it throws, its changes are undone, but the event row survives
//      as Failed so it can be reprocessed
//
// handle() returns { outcome, status } where outcome is one of: invalid_signature, bad_body, duplicate,
// processed, ignored, failed, and status is the HTTP status to answer with (500 only for failed, so Razorpay retries).

const STATUS = WEBHOOK_EVENT_STATUS;
const PROVIDER = 'razorpay';

// Without the header (for example a replay without it) the id is derived from the event itself, so the same event
// always gets the same id: account, event name, time and the ids of the objects inside it.
const deriveEventId = (event) => {
  const ids = Object.values(event.payload || {})
    .map((part) => part && part.entity && part.entity.id)
    .filter(Boolean)
    .join(',');
  const seed = [event.account_id, event.event, event.created_at, ids].join('|');
  return `derived_${crypto.createHash('sha256').update(seed).digest('hex').slice(0, 40)}`;
};

const shorten = (text) => String(text || '').slice(0, 500);

// runs the handler inside a savepoint and records the result on the event row
const attempt = async (row, event, transaction) => {
  await row.update({ attempts: Number(row.attempts) + 1 }, { transaction });

  try {
    const result = await sequelize.transaction({ transaction }, (inner) => WebhookProcessor.process(event, { transaction: inner }));
    const ignored = result.outcome === 'ignored';
    await row.update(
      {
        status: ignored ? STATUS.IGNORED : STATUS.PROCESSED,
        processedAt: new Date(),
        errorMessage: result.message ? shorten(result.message) : null,
      },
      { transaction },
    );
    return { outcome: ignored ? 'ignored' : 'processed', status: 200, event: row };
  } catch (error) {
    await row.update({ status: STATUS.FAILED, errorMessage: shorten(error.message) }, { transaction });
    return { outcome: 'failed', status: 500, event: row, error };
  }
};

const handle = async ({ rawBody, signature, eventId }) => {
  if (!Razorpay.verifyWebhookSignature(rawBody, signature)) return { outcome: 'invalid_signature', status: 400 };

  let event;
  try {
    event = JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody));
  } catch (error) {
    return { outcome: 'bad_body', status: 400 };
  }
  if (!event || typeof event.event !== 'string') return { outcome: 'bad_body', status: 400 };

  const id = String(eventId || deriveEventId(event)).slice(0, 80);

  return sequelize.transaction(async (transaction) => {
    await lock(`webhook:${id}`, transaction);

    let row = await WebhookEvent.findOne({ where: { provider: PROVIDER, eventId: id }, transaction });
    if (row && [STATUS.PROCESSED, STATUS.IGNORED].includes(Number(row.status))) {
      return { outcome: 'duplicate', status: 200, event: row };
    }

    if (!row) {
      row = await WebhookEvent.create(
        {
          provider: PROVIDER,
          eventId: id,
          eventType: event.event.slice(0, 80),
          status: STATUS.RECEIVED,
          payload: event,
          signatureValid: 1,
          attempts: 0,
          receivedAt: new Date(),
        },
        { transaction },
      );
    }

    return attempt(row, event, transaction);
  });
};

// Runs a stored Failed event again (Admin app "Reprocess"). The signature was checked when it arrived.
const reprocess = async (uuid, ctx) =>
  sequelize.transaction(async (transaction) => {
    const found = await WebhookEvent.findOne({ where: { uuid }, transaction });
    if (!found) throw AppError.notFound();

    await lock(`webhook:${found.eventId}`, transaction);
    const row = await WebhookEvent.findOne({ where: { uuid }, transaction });
    if (Number(row.status) !== STATUS.FAILED) {
      throw AppError.validation({ event: ['Only an event that failed can be processed again.'] });
    }

    const result = await attempt(row, row.payload, transaction);
    await Audit.log(
      ctx,
      'webhook_event.reprocessed',
      {
        entityType: 'webhook_event',
        entityUuid: row.uuid,
        description: `Processed ${row.eventType} again: ${result.outcome}`,
        after: { outcome: result.outcome, attempts: Number(row.attempts) },
      },
      { transaction },
    );
    return result;
  });

module.exports = { handle, reprocess, deriveEventId };
