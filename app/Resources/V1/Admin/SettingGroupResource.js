const Resource = require('@app/Resources/Resource');

// One group of settings with what the form needs: label, description, type, limits and the current value.
//   SettingGroupResource.make({ name, label, values, definitions })
class SettingGroupResource extends Resource {
  toArray() {
    const group = this.resource;

    return {
      name: group.name,
      label: group.label,
      settings: group.definitions.map((definition) => ({
        key: definition.key,
        label: definition.label,
        description: definition.description,
        type: definition.type,
        value: group.values[definition.key],
        min: definition.min ?? null,
        max: definition.max ?? null,
        maxLength: definition.maxLength ?? null,
        maxItems: definition.maxItems ?? null,
        maxItemLength: definition.maxItemLength ?? null,
      })),
    };
  }
}

module.exports = SettingGroupResource;
