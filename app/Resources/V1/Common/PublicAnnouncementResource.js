const Resource = require('@app/Resources/Resource');

// What a school sees: no internal details, no audience, no author.
class PublicAnnouncementResource extends Resource {
  toArray() {
    const announcement = this.resource;

    return {
      uuid: announcement.uuid,
      title: announcement.title,
      body: announcement.body,
      type: Number(announcement.type),
      startsAt: announcement.startsAt,
      endsAt: announcement.endsAt,
    };
  }
}

module.exports = PublicAnnouncementResource;
