const Resource = require('@app/Resources/Resource');

// A payment reported by Razorpay. Money is in paise. The raw gateway object is only included for the detail view.
class PaymentResource extends Resource {
  toArray() {
    const payment = this.resource;

    return {
      uuid: payment.uuid,
      status: Number(payment.status),
      client: this.when(payment.client, () => ({ uuid: payment.client.uuid, name: payment.client.name })),
      subscriptionUuid: this.when(payment.subscription, () => payment.subscription.uuid),
      razorpayPaymentId: payment.razorpayPaymentId,
      razorpayOrderId: payment.razorpayOrderId,
      razorpayInvoiceId: payment.razorpayInvoiceId,
      razorpayRefundId: payment.razorpayRefundId,
      method: payment.method,
      amountPaise: Number(payment.amountPaise),
      currency: payment.currency,
      feePaise: payment.feePaise === null ? null : Number(payment.feePaise),
      taxPaise: payment.taxPaise === null ? null : Number(payment.taxPaise),
      refundedPaise: Number(payment.refundedPaise) || 0,
      failureCode: payment.failureCode,
      failureReason: payment.failureReason,
      paidAt: payment.paidAt,
      createdAt: payment.createdAt,
      gatewayData: this.when(this.extra.withGateway, () => payment.gatewayData),
    };
  }
}

module.exports = PaymentResource;
