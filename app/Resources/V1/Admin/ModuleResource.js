const Resource = require('@app/Resources/Resource');

class ModuleResource extends Resource {
  toArray() {
    const module = this.resource;

    return {
      uuid: module.uuid,
      moduleKey: module.moduleKey,
      name: module.name,
      description: module.description,
      sortOrder: module.sortOrder,
      status: Number(module.status),
      isCore: Number(module.isCore) === 1,
    };
  }
}

module.exports = ModuleResource;
