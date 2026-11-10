const Resource = require('@app/Resources/Resource');
const Files = require('@app/Helpers/files');
const { roleNames } = require('@config/schoolPermissions');

// Shapes a school user for the API. Never the password hash, the internal id or the school's internal id.
//   UserResource.make(user, { permissions })
class UserResource extends Resource {
  toArray() {
    const user = this.resource;

    return {
      uuid: user.uuid,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: Number(user.role),
      roleName: roleNames[Number(user.role)] || null,
      status: Number(user.status),
      mustChangePassword: Number(user.mustChangePassword) === 1,
      lastLoginAt: user.lastLoginAt,
      profileImage: Files.url('userProfile', user.profileImage),
      permissions: this.when(this.extra.permissions !== undefined, () => this.extra.permissions),
    };
  }
}

module.exports = UserResource;
