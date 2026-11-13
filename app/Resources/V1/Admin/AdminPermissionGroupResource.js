const Resource = require('@app/Resources/Resource');

// One module of the permission checklist: { module, label, items: [{ key, name }] }.
// The resource is { module, permissions: [AdminPermission rows] }.
const label = (module) => {
  const words = String(module).replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

class AdminPermissionGroupResource extends Resource {
  toArray() {
    const { module, permissions } = this.resource;

    return {
      module,
      label: label(module),
      items: permissions.map((permission) => ({ key: permission.permissionKey, name: permission.name })),
    };
  }
}

module.exports = AdminPermissionGroupResource;
