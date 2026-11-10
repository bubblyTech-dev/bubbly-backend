const Resource = require('@app/Resources/Resource');

// Our own GST invoice. Money is in paise.
class InvoiceResource extends Resource {
  toArray() {
    const invoice = this.resource;

    return {
      uuid: invoice.uuid,
      invoiceNo: invoice.invoiceNo,
      status: Number(invoice.status),
      client: this.when(invoice.client, () => ({ uuid: invoice.client.uuid, name: invoice.client.name })),
      subscriptionUuid: this.when(invoice.subscription, () => invoice.subscription.uuid),
      razorpayPaymentId: this.when(invoice.payment, () => invoice.payment.razorpayPaymentId),
      razorpayInvoiceId: invoice.razorpayInvoiceId,
      issuedAt: invoice.issuedAt,
      periodStart: invoice.periodStart,
      periodEnd: invoice.periodEnd,
      subtotalPaise: Number(invoice.subtotalPaise),
      taxPaise: Number(invoice.taxPaise),
      totalPaise: Number(invoice.totalPaise),
      taxRatePercent: Number(invoice.taxRatePercent),
      seller: {
        name: invoice.sellerName,
        address: invoice.sellerAddress,
        gstNumber: invoice.sellerGstNumber,
      },
      buyer: {
        name: invoice.buyerName,
        address: invoice.buyerAddress,
        gstNumber: invoice.gstNumber,
      },
      pdfAvailable: Boolean(invoice.pdfFile),
    };
  }
}

module.exports = InvoiceResource;
