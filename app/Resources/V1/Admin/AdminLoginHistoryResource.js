const Resource = require('@app/Resources/Resource');

// One login attempt of an admin.
class AdminLoginHistoryResource extends Resource {
  toArray() {
    const entry = this.resource;

    return {
      uuid: entry.uuid,
      emailTried: entry.emailTried,
      method: Number(entry.method),
      result: Number(entry.result), // 1: Success, 2: Failed
      failureReason: entry.failureReason === null ? null : Number(entry.failureReason), // 1: Wrong password, 2: Unknown email, 3: Inactive, 4: Locked
      ipAddress: entry.ipAddress,
      userAgent: entry.userAgent,
      createdAt: entry.createdAt,
    };
  }
}

module.exports = AdminLoginHistoryResource;
