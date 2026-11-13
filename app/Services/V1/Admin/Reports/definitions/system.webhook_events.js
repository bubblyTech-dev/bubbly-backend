const { QueryTypes } = require('sequelize');
const { sequelize } = require('@app/Helpers/database');
const optionSets = require('../optionSets');
const { contains, startsWith, truncate, jsonNumber } = require('../support/common');

// The log of what the payment provider (Razorpay) sent us, and what happened to each message.
//
// What is and is not included (a deliberate choice):
//   - The raw payload is NEVER included: it carries customer names, emails and phone numbers.
//   - Three short facts from the payload are included because they hold no personal data: the subscription id,
//     the payment id and the payment amount. They are enough to find the matching record and to spot a problem.
//   - Only messages with a valid signature are stored, so a forged call never appears here.
//   - The error text is cut to 300 characters.

module.exports = {
  key: 'system.webhook_events',
  area: 'system',
  title: 'Webhook event log',
  description: 'Every event received from the payment provider with its status, attempts and any error. No customer details are included.',
  usesDateRange: true,

  filters: [
    { key: 'status', label: 'Status', type: 'select', options: 'webhookStatus' },
    { key: 'eventType', label: 'Event type starts with', type: 'text' },
    { key: 'eventId', label: 'Event id', type: 'text' },
  ],

  columns: [
    { key: 'receivedAt', label: 'Received', type: 'datetime', width: 18 },
    { key: 'eventType', label: 'Event', type: 'text', width: 28 },
    { key: 'eventId', label: 'Event id', type: 'text', width: 28 },
    { key: 'status', label: 'Status', type: 'text', width: 12 },
    { key: 'attempts', label: 'Attempts', type: 'integer', width: 10 },
    { key: 'processedAt', label: 'Processed', type: 'datetime', width: 18 },
    { key: 'subscriptionId', label: 'Subscription id', type: 'text', width: 28 },
    { key: 'paymentId', label: 'Payment id', type: 'text', width: 28 },
    { key: 'amountPaise', label: 'Amount', type: 'money', width: 14 },
    { key: 'errorMessage', label: 'Error', type: 'text', width: 50 },
  ],

  async run({ range, filters, page, perPage }) {
    const where = ['e.received_at >= :from', 'e.received_at <= :to'];
    const replacements = { from: range.fromDate, to: range.toDate, limit: perPage, offset: (page - 1) * perPage };

    if (filters.status !== undefined) {
      where.push('e.status = :status');
      replacements.status = filters.status;
    }
    if (filters.eventType) {
      where.push('e.event_type ILIKE :type');
      replacements.type = startsWith(filters.eventType);
    }
    if (filters.eventId) {
      where.push('e.event_id ILIKE :eventId');
      replacements.eventId = contains(filters.eventId);
    }

    const from = `FROM webhook_events e WHERE ${where.join(' AND ')}`;
    const [{ total }] = await sequelize.query(`SELECT COUNT(*)::int AS total ${from}`, { replacements, type: QueryTypes.SELECT });

    const rows = await sequelize.query(
      `SELECT e.received_at AS "receivedAt", e.event_type AS "eventType", e.event_id AS "eventId", e.status, e.attempts,
              e.processed_at AS "processedAt",
              e.payload->'payload'->'subscription'->'entity'->>'id' AS "subscriptionId",
              e.payload->'payload'->'payment'->'entity'->>'id' AS "paymentId",
              ${jsonNumber("e.payload->'payload'->'payment'->'entity'->>'amount'")} AS "amountPaise",
              e.error_message AS "errorMessage"
         ${from}
        ORDER BY e.received_at DESC, e.id DESC
        LIMIT :limit OFFSET :offset`,
      { replacements, type: QueryTypes.SELECT },
    );

    return {
      rows: rows.map((row) => ({
        ...row,
        status: optionSets.label('webhookStatus', row.status),
        attempts: row.attempts || 0,
        subscriptionId: row.subscriptionId || '',
        paymentId: row.paymentId || '',
        amountPaise: row.amountPaise === null ? null : Number(row.amountPaise),
        errorMessage: truncate(row.errorMessage, 300),
      })),
      total,
    };
  },
};
