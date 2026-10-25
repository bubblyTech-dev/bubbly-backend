const Resource = require('@app/Resources/Resource');
const Files = require('@app/Helpers/files');

// Shapes an admin for the API. Only these fields ever leave the server (no password hash, no internal id).
//   AdminUserResource.make(admin, { permissions })
class AdminUserResource extends Resource {
  toArray() {
    const admin = this.resource;

    return {
      uuid: admin.uuid,
      name: admin.name,
      email: admin.email,
      phone: admin.phone,
      profileImage: Files.url('adminProfile', admin.profileImage),
      type: Number(admin.type),
      isMaster: Number(admin.type) === 1,
      status: Number(admin.status),
      mustChangePassword: Number(admin.mustChangePassword) === 1,
      lastLoginAt: admin.lastLoginAt,
      permissions: this.extra.permissions ?? [],
    };
  }
}

module.exports = AdminUserResource;
