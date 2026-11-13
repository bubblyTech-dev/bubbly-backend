const { Op } = require('sequelize');
const AppError = require('@app/Helpers/AppError');
const { paginationParams } = require('@app/Helpers/pagination');
const { isUuid } = require('@app/Helpers/ref');
const { AdminUser, Client, Subscription, Payment, Invoice, WebhookEvent } = require('@app/Models');
const WebhookEventResource = require('@app/Resources/V1/Admin/WebhookEventResource');
const PaymentResource = require('@app/Resources/V1/Admin/PaymentResource');
const InvoiceResource = require('@app/Resources/V1/Admin/InvoiceResource');

// Read-only lists for the Billing pages of the Admin app: webhook events, payments and invoices.

const escapeLike = (text) => text.replace(/[\\%_]/g, '\\$&');
const likeOf = (text) => `%${escapeLike(text)}%`;
const newestFirst = [['createdAt', 'DESC'], ['id', 'DESC']];

const clientInclude = { model: Client, as: 'client', attributes: ['id', 'uuid', 'name'] };
const recorderInclude = { model: AdminUser, as: 'recorder', attributes: ['id', 'name', 'email'] };
const subscriptionInclude = { model: Subscription, as: 'subscription', attributes: ['id', 'uuid'] };

// ---------- webhook events ----------

const listEvents = async (query) => {
  const { page, perPage, limit, offset } = paginationParams(query);
  const where = {};
  if (query.status) where.status = Number(query.status);
  if (query.type) where.eventType = query.type;
  if (query.search) where.eventId = { [Op.iLike]: likeOf(query.search) };

  const { rows, count } = await WebhookEvent.findAndCountAll({
    where,
    order: [['receivedAt', 'DESC'], ['id', 'DESC']],
    limit,
    offset,
  });
  return WebhookEventResource.paginate({ rows, count, page, perPage });
};

const findEvent = async (uuid) => {
  const event = isUuid(uuid) ? await WebhookEvent.findOne({ where: { uuid } }) : null;
  if (!event) throw AppError.notFound();
  return event;
};

const showEvent = async (uuid) => WebhookEventResource.make(await findEvent(uuid), { withPayload: true });

// ---------- payments ----------

const listPayments = async (query) => {
  const { page, perPage, limit, offset } = paginationParams(query);
  const where = {};
  if (query.status) where.status = Number(query.status);
  if (query.source) where.source = Number(query.source);
  if (query.subscription && isUuid(query.subscription)) where['$subscription.uuid$'] = query.subscription;
  if (query.search) {
    const pattern = likeOf(query.search);
    where[Op.or] = [
      { '$client.name$': { [Op.iLike]: pattern } },
      { razorpayPaymentId: { [Op.iLike]: pattern } },
      { reference: { [Op.iLike]: pattern } },
    ];
  }

  const { rows, count } = await Payment.findAndCountAll({
    where,
    include: [clientInclude, subscriptionInclude, recorderInclude],
    order: newestFirst,
    limit,
    offset,
  });
  return PaymentResource.paginate({ rows, count, page, perPage });
};

const showPayment = async (uuid) => {
  const payment = isUuid(uuid) ? await Payment.findOne({ where: { uuid }, include: [clientInclude, subscriptionInclude, recorderInclude] }) : null;
  if (!payment) throw AppError.notFound();
  return PaymentResource.make(payment, { withGateway: true });
};

// ---------- invoices ----------

const invoiceIncludes = [clientInclude, subscriptionInclude, { model: Payment, as: 'payment', attributes: ['id', 'razorpayPaymentId'] }];

const listInvoices = async (query) => {
  const { page, perPage, limit, offset } = paginationParams(query);
  const where = {};
  if (query.status) where.status = Number(query.status);
  if (query.search) {
    const pattern = likeOf(query.search);
    where[Op.or] = [{ '$client.name$': { [Op.iLike]: pattern } }, { invoiceNo: { [Op.iLike]: pattern } }];
  }

  const { rows, count } = await Invoice.findAndCountAll({
    where,
    include: invoiceIncludes,
    order: [['issuedAt', 'DESC'], ['id', 'DESC']],
    limit,
    offset,
  });
  return InvoiceResource.paginate({ rows, count, page, perPage });
};

const showInvoice = async (uuid) => {
  const invoice = isUuid(uuid) ? await Invoice.findOne({ where: { uuid }, include: invoiceIncludes }) : null;
  if (!invoice) throw AppError.notFound();
  return InvoiceResource.make(invoice);
};

module.exports = { listEvents, showEvent, listPayments, showPayment, listInvoices, showInvoice };
