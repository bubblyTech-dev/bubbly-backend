const Resource = require('@app/Resources/Resource');

// One status change of a school. `changer` is loaded with the row (the admin who made the change).
class SchoolStatusHistoryResource extends Resource {
  toArray() {
    const row = this.resource;

    return {
      uuid: row.uuid,
      fromStatus: Number(row.fromStatus),
      toStatus: Number(row.toStatus),
      reason: row.reason,
      changedBy: row.changer ? { uuid: row.changer.uuid, name: row.changer.name } : null,
      createdAt: row.createdAt,
    };
  }
}

module.exports = SchoolStatusHistoryResource;
