const Resource = require('@app/Resources/Resource');

// One line in the notification bell. The service builds plain items; this is the shape that leaves the server.
//   type     inquiry | payment_failed | subscription_past_due
//   link     the Admin app route to open (the app adds the ids it needs itself)
class NotificationResource extends Resource {
  toArray() {
    const item = this.resource;

    return {
      type: item.type,
      uuid: item.uuid,
      title: item.title,
      subtitle: item.subtitle,
      createdAt: item.createdAt,
      link: item.link,
    };
  }
}

module.exports = NotificationResource;
