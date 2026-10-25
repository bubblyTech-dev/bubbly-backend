const Resource = require('@app/Resources/Resource');
const { ANNOUNCEMENT_STATUS } = require('@app/Helpers/constants');

// What the status really is right now. Scheduled, Published and Expired are worked out from the dates,
// so nothing has to run in the background when time passes.
const effectiveStatus = (announcement, now = new Date()) => {
  const stored = Number(announcement.status);
  if (stored === ANNOUNCEMENT_STATUS.DRAFT) return ANNOUNCEMENT_STATUS.DRAFT;
  if (stored === ANNOUNCEMENT_STATUS.EXPIRED) return ANNOUNCEMENT_STATUS.EXPIRED;

  if (announcement.endsAt && new Date(announcement.endsAt) <= now) return ANNOUNCEMENT_STATUS.EXPIRED;
  if (announcement.startsAt && new Date(announcement.startsAt) > now) return ANNOUNCEMENT_STATUS.SCHEDULED;
  return ANNOUNCEMENT_STATUS.PUBLISHED;
};

// AnnouncementResource.make(announcement, { targets: [{ uuid, name }] })
class AnnouncementResource extends Resource {
  toArray() {
    const announcement = this.resource;

    return {
      uuid: announcement.uuid,
      title: announcement.title,
      body: announcement.body,
      type: Number(announcement.type),
      status: effectiveStatus(announcement),
      targetType: Number(announcement.targetType),
      startsAt: announcement.startsAt,
      endsAt: announcement.endsAt,
      publishedAt: announcement.publishedAt,
      createdAt: announcement.createdAt,
      updatedAt: announcement.updatedAt,
      createdBy: this.whenLoaded('creator', () =>
        announcement.creator ? { uuid: announcement.creator.uuid, name: announcement.creator.name } : null,
      ),
      targets: this.when(this.extra.targets !== undefined, () => this.extra.targets),
    };
  }
}

AnnouncementResource.effectiveStatus = effectiveStatus;

module.exports = AnnouncementResource;
