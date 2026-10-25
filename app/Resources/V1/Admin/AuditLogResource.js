const Resource = require('@app/Resources/Resource');

// One row of the audit log.
class AuditLogResource extends Resource {
  toArray() {
    const log = this.resource;

    return {
      uuid: log.uuid,
      actorName: log.actorName,
      action: log.action,
      description: log.description,
      entityType: log.entityType,
      entityUuid: log.entityUuid,
      before: log.beforeData,
      after: log.afterData,
      ipAddress: log.ipAddress,
      createdAt: log.createdAt,
    };
  }
}

module.exports = AuditLogResource;
