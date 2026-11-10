const Audit = require('@app/Helpers/audit');
const Settings = require('@app/Helpers/settings');
const Tax = require('@app/Helpers/tax');
const { sequelize } = require('@app/Helpers/database');
const { INVOICE_STATUS } = require('@app/Helpers/constants');
const { Client, Plan, Invoice, InvoiceCounter } = require('@app/Models');

// Issues OUR GST invoice for a captured payment (Razorpay does not issue GST invoices).
//
//   - one invoice per payment: asking twice returns the invoice that already exists
//   - the number is PREFIX-YYYY-NNNN, taken from a per-year counter inside the same transaction under a lock,
//     so numbers are gapless and never repeat even when two payments arrive at the same moment
//   - seller details come from the platform settings, buyer details from the school; both are copied onto the
//     invoice so it never changes when a setting or an address changes later
//   - the total is what Razorpay actually charged; the tax split follows our settings and the plan (see Helpers/tax.js)

// calendar year in India, so an invoice issued just after midnight IST is not given the previous year
const yearOf = (date) => Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric' }).format(date));

const nextNumber = async (year, prefix, transaction) => {
  await sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))', {
    replacements: { key: `invoice-counter:${year}` },
    transaction,
  });

  let counter = await InvoiceCounter.findOne({ where: { year }, transaction, lock: transaction.LOCK.UPDATE });
  if (!counter) counter = await InvoiceCounter.create({ year, lastNumber: 0 }, { transaction });

  const number = Number(counter.lastNumber) + 1;
  await counter.update({ lastNumber: number }, { transaction });
  return `${prefix}-${year}-${String(number).padStart(4, '0')}`;
};

const addressOf = (client) =>
  [client.addressLine1, client.addressLine2, client.city, client.state, client.postalCode, client.country].filter(Boolean).join(', ');

// returns { invoice, created }: the existing or the new invoice (invoice is null when the payment should not get one).
// `created` is true only for the call that really made the invoice, which is when its receipt email is due.
const issue = async ({ subscription, payment, transaction }) => {
  if (!payment || !(Number(payment.amountPaise) > 0)) return { invoice: null, created: false };

  const existing = await Invoice.findOne({ where: { paymentId: payment.id }, transaction });
  if (existing) return { invoice: existing, created: false };

  const client = await Client.findByPk(subscription.clientId, { transaction });
  const plan = await Plan.findByPk(subscription.planId, { transaction });
  const billing = await Settings.group('billing');

  const rate = Number(billing['billing.gst_rate_percent']);
  const amounts = Tax.invoiceAmounts({
    chargedPaise: payment.amountPaise,
    basePricePaise: plan ? plan.pricePaise : payment.amountPaise,
    taxInclusive: plan ? plan.taxInclusive : 1,
    ratePercent: rate,
  });

  const issuedAt = new Date();
  const invoiceNo = await nextNumber(yearOf(issuedAt), billing['billing.invoice_prefix'] || 'INV', transaction);

  const invoice = await Invoice.create(
    {
      clientId: subscription.clientId,
      subscriptionId: subscription.id,
      paymentId: payment.id,
      invoiceNo,
      razorpayInvoiceId: payment.razorpayInvoiceId || null,
      status: INVOICE_STATUS.PAID,
      issuedAt,
      periodStart: subscription.currentPeriodStart,
      periodEnd: subscription.currentPeriodEnd,
      subtotalPaise: amounts.subtotalPaise,
      taxPaise: amounts.taxPaise,
      totalPaise: amounts.totalPaise,
      taxRatePercent: rate,
      gstNumber: client ? client.gstNumber : null,
      sellerGstNumber: billing['billing.gst_number'] || null,
      sellerName: billing['billing.company_name'] || null,
      sellerAddress: billing['billing.company_address'] || null,
      buyerName: client ? client.name : null,
      buyerAddress: client ? addressOf(client) : null,
    },
    { transaction },
  );

  await Audit.log(
    {},
    'invoice.issued',
    {
      entityType: 'invoice',
      entityUuid: invoice.uuid,
      clientId: subscription.clientId,
      description: `Invoice ${invoiceNo} issued`,
      after: { invoiceNo, totalPaise: amounts.totalPaise, taxPaise: amounts.taxPaise },
    },
    { transaction },
  );

  return { invoice, created: true };
};

// returns the existing or the new invoice, or null when the payment should not get one
const issueForPayment = async (args) => (await issue(args)).invoice;

module.exports = { issueForPayment, issueForPaymentWithFlag: issue, nextNumber, yearOf };
