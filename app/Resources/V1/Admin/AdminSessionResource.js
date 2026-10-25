const Resource = require('@app/Resources/Resource');

// One signed-in device of an admin. The refresh token hash never leaves the server.
class AdminSessionResource extends Resource {
  toArray() {
    const session = this.resource;

    return {
      uuid: session.uuid,
      deviceLabel: session.deviceLabel,
      ipAddress: session.ipAddress,
      lastUsedAt: session.lastUsedAt,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
    };
  }
}

module.exports = AdminSessionResource;
