const Resource = require('@app/Resources/Resource');

// A stored webhook call. The payload (what Razorpay sent) is only included for the detail view:
//   WebhookEventResource.make(row, { withPayload: true })
class WebhookEventResource extends Resource {
  toArray() {
    const event = this.resource;

    return {
      uuid: event.uuid,
      provider: event.provider,
      eventId: event.eventId,
      eventType: event.eventType,
      status: Number(event.status),
      attempts: Number(event.attempts),
      receivedAt: event.receivedAt,
      processedAt: event.processedAt,
      errorMessage: event.errorMessage,
      payload: this.when(this.extra.withPayload, () => event.payload),
    };
  }
}

module.exports = WebhookEventResource;
