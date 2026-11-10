const PDFDocument = require('pdfkit');
const AppError = require('@app/Helpers/AppError');
const Audit = require('@app/Helpers/audit');
const Files = require('@app/Helpers/files');
const Settings = require('@app/Helpers/settings');
const { isUuid } = require('@app/Helpers/ref');
const { sequelize } = require('@app/Helpers/database');
const { Client, Invoice, Payment, Plan, Subscription } = require('@app/Models');

// Makes the PDF of one of our GST invoices and keeps it in private storage.
// The first download creates the file and remembers its name in invoices.pdf_file; later downloads stream the same file.
// Built-in PDF fonts have no rupee sign, so amounts are written as "Rs.".

const FILE_TYPE = 'invoicePdf';

const INVOICE_INCLUDES = [
  { model: Client, as: 'client', attributes: ['id', 'uuid', 'name'] },
  { model: Payment, as: 'payment' },
  {
    model: Subscription,
    as: 'subscription',
    attributes: ['id', 'uuid', 'billingInterval'],
    include: [{ model: Plan, as: 'plan', attributes: ['id', 'name'] }],
  },
];

const INTERVAL_LABELS = { 1: 'Monthly', 2: 'Quarterly', 3: 'Yearly' };

// a setting that may not exist yet; the PDF still works without it
const settingOr = async (key, fallback = '') => {
  try {
    const value = await Settings.get(key);
    return value === null || value === undefined ? fallback : value;
  } catch (error) {
    return fallback;
  }
};

// ---------- formatting ----------

const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })
    : '-';

const formatMoney = (paise) =>
  `Rs. ${(Number(paise) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

const belowThousand = (number) => {
  const parts = [];
  if (number >= 100) {
    parts.push(`${ONES[Math.floor(number / 100)]} Hundred`);
    number %= 100;
  }
  if (number >= 20) {
    parts.push(TENS[Math.floor(number / 10)] + (number % 10 ? ` ${ONES[number % 10]}` : ''));
  } else if (number > 0) {
    parts.push(ONES[number]);
  }
  return parts.join(' ');
};

// 123456789 -> "Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine" (Indian grouping)
const wordsOf = (number) => {
  if (number === 0) return 'Zero';
  const parts = [];
  const crore = Math.floor(number / 10000000);
  const lakh = Math.floor((number % 10000000) / 100000);
  const thousand = Math.floor((number % 100000) / 1000);
  const rest = number % 1000;
  if (crore) parts.push(`${wordsOf(crore)} Crore`);
  if (lakh) parts.push(`${belowThousand(lakh)} Lakh`);
  if (thousand) parts.push(`${belowThousand(thousand)} Thousand`);
  if (rest) parts.push(belowThousand(rest));
  return parts.join(' ');
};

const amountInWords = (paise) => {
  const total = Math.round(Number(paise));
  const rupees = Math.floor(total / 100);
  const remainder = total % 100;
  const rupeeText = `${wordsOf(rupees)} Rupees`;
  return remainder ? `${rupeeText} and ${wordsOf(remainder)} Paise Only` : `${rupeeText} Only`;
};

// ---------- drawing ----------

const paymentReference = (payment) => {
  if (!payment) return '-';
  if (payment.razorpayPaymentId) return `Razorpay payment ${payment.razorpayPaymentId}`;
  // offline payments keep their own reference (column added by the offline payments feature)
  const reference = typeof payment.get === 'function' ? payment.get('reference') : null;
  return reference ? `Offline payment, ref. ${reference}` : 'Offline payment';
};

const buildPdf = (invoice, extras) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      info: {
        Title: `Tax invoice ${invoice.invoiceNo}`,
        Author: invoice.sellerName || 'Bubbly',
        CreationDate: invoice.issuedAt ? new Date(invoice.issuedAt) : new Date(0),
      },
    });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const width = right - left;
    const ink = '#14213d';
    const muted = '#5b6b86';
    const line = '#dde4ee';

    // seller (left) and invoice title (right)
    doc.fillColor(ink).font('Helvetica-Bold').fontSize(16).text(invoice.sellerName || 'Seller', left, 50, { width: width * 0.6 });
    doc.font('Helvetica').fontSize(9).fillColor(muted);
    if (invoice.sellerAddress) doc.text(invoice.sellerAddress, { width: width * 0.55 });
    if (invoice.sellerGstNumber) doc.text(`GSTIN: ${invoice.sellerGstNumber}`);
    if (extras.sacCode) doc.text(`SAC: ${extras.sacCode}`);
    const sellerEnd = doc.y;

    doc.font('Helvetica-Bold').fontSize(20).fillColor(ink).text('TAX INVOICE', left, 50, { width, align: 'right' });
    doc.font('Helvetica').fontSize(10).fillColor(muted);
    doc.text(`Invoice no: ${invoice.invoiceNo}`, left, 78, { width, align: 'right' });
    doc.text(`Date: ${formatDate(invoice.issuedAt)}`, left, 92, { width, align: 'right' });

    let y = Math.max(sellerEnd, 120) + 18;
    doc.moveTo(left, y).lineTo(right, y).strokeColor(line).stroke();
    y += 14;

    // bill to
    doc.font('Helvetica-Bold').fontSize(9).fillColor(muted).text('BILL TO', left, y);
    doc.font('Helvetica-Bold').fontSize(12).fillColor(ink).text(invoice.buyerName || (invoice.client && invoice.client.name) || '-', left, y + 14, { width: width * 0.6 });
    doc.font('Helvetica').fontSize(9).fillColor(muted);
    if (invoice.buyerAddress) doc.text(invoice.buyerAddress, { width: width * 0.55 });
    if (invoice.gstNumber) doc.text(`GSTIN: ${invoice.gstNumber}`);
    y = doc.y + 22;

    // table
    const colDescription = left;
    const colPeriod = left + width * 0.5;
    const colAmount = left + width * 0.78;
    doc.rect(left, y, width, 24).fillColor('#eef2f8').fill();
    doc.font('Helvetica-Bold').fontSize(9).fillColor(ink);
    doc.text('DESCRIPTION', colDescription + 8, y + 8);
    doc.text('PERIOD', colPeriod, y + 8);
    doc.text('AMOUNT', colAmount, y + 8, { width: right - colAmount - 8, align: 'right' });
    y += 24;

    const plan = invoice.subscription && invoice.subscription.plan ? invoice.subscription.plan.name : 'Subscription';
    const interval = invoice.subscription ? INTERVAL_LABELS[Number(invoice.subscription.billingInterval)] : null;
    const description = interval ? `${plan} plan (${interval})` : `${plan} plan`;
    const period = invoice.periodStart || invoice.periodEnd ? `${formatDate(invoice.periodStart)} to ${formatDate(invoice.periodEnd)}` : '-';

    doc.font('Helvetica').fontSize(10).fillColor(ink);
    doc.text(description, colDescription + 8, y + 10, { width: colPeriod - colDescription - 16 });
    doc.text(period, colPeriod, y + 10, { width: colAmount - colPeriod - 8 });
    doc.text(formatMoney(invoice.subtotalPaise), colAmount, y + 10, { width: right - colAmount - 8, align: 'right' });
    y += 38;
    doc.moveTo(left, y).lineTo(right, y).strokeColor(line).stroke();
    y += 14;

    // totals
    const labelX = left + width * 0.55;
    const valueWidth = right - colAmount - 8;
    const totalRow = (label, value, bold = false) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 12 : 10).fillColor(ink);
      doc.text(label, labelX, y, { width: colAmount - labelX - 8 });
      doc.text(value, colAmount, y, { width: valueWidth, align: 'right' });
      y += bold ? 24 : 18;
    };
    totalRow('Subtotal', formatMoney(invoice.subtotalPaise));
    totalRow(`GST @ ${Number(invoice.taxRatePercent)}%`, formatMoney(invoice.taxPaise));
    doc.moveTo(labelX, y - 4).lineTo(right, y - 4).strokeColor(line).stroke();
    y += 4;
    totalRow('Total', formatMoney(invoice.totalPaise), true);

    // words and payment
    y += 6;
    doc.font('Helvetica-Bold').fontSize(9).fillColor(muted).text('AMOUNT IN WORDS', left, y);
    doc.font('Helvetica').fontSize(10).fillColor(ink).text(amountInWords(invoice.totalPaise), left, y + 13, { width });
    y = doc.y + 14;
    doc.font('Helvetica-Bold').fontSize(9).fillColor(muted).text('PAYMENT', left, y);
    doc.font('Helvetica').fontSize(10).fillColor(ink).text(paymentReference(invoice.payment), left, y + 13, { width });
    y = doc.y + 22;

    // terms and footer
    if (extras.terms) {
      doc.font('Helvetica-Bold').fontSize(9).fillColor(muted).text('TERMS', left, y);
      doc.font('Helvetica').fontSize(9).fillColor(ink).text(extras.terms, left, y + 13, { width });
      y = doc.y + 18;
    }
    if (extras.footer) {
      doc.font('Helvetica').fontSize(9).fillColor(muted).text(extras.footer, left, Math.max(y, doc.page.height - 90), { width, align: 'center' });
    }

    doc.end();
  });

// ---------- service ----------

const loadInvoice = async (uuid, options = {}) => {
  const invoice = isUuid(uuid) ? await Invoice.findOne({ where: { uuid }, include: INVOICE_INCLUDES, ...options }) : null;
  if (!invoice) throw AppError.notFound();
  return invoice;
};

// Returns { invoice, stream } ready to send. `refresh` (master only, checked by the caller) rebuilds the file.
const download = async (uuid, ctx, { refresh = false } = {}) => {
  const invoice = await sequelize.transaction(async (transaction) => {
    // the row lock stops two first downloads from each making a file
    const locked = await Invoice.findOne({ where: { uuid: isUuid(uuid) ? uuid : null }, lock: transaction.LOCK.UPDATE, transaction });
    if (!locked) throw AppError.notFound();

    if (!locked.pdfFile || refresh) {
      const full = await loadInvoice(uuid, { transaction });
      const [sacCode, footer, terms] = await Promise.all([
        settingOr('billing.sac_code'),
        settingOr('billing.invoice_footer'),
        settingOr('billing.invoice_terms'),
      ]);
      const buffer = await buildPdf(full, { sacCode, footer, terms });
      const name = await Files.putGenerated(FILE_TYPE, buffer, `${full.invoiceNo}.pdf`);
      const previous = locked.pdfFile;
      await locked.update({ pdfFile: name }, { transaction });
      if (previous) await Files.remove(FILE_TYPE, previous);
    }

    return loadInvoice(uuid, { transaction });
  });

  const stream = Files.stream(FILE_TYPE, invoice.pdfFile);
  if (!stream) throw AppError.notFound('The invoice file could not be read.');

  await Audit.log(
    ctx,
    'invoice.pdf_downloaded',
    {
      entityType: 'invoice',
      entityUuid: invoice.uuid,
      clientId: invoice.clientId,
      description: `Downloaded invoice ${invoice.invoiceNo}`,
    },
    {},
  );

  return { invoice, stream };
};

module.exports = { download, amountInWords, formatMoney };
