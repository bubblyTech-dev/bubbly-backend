const AppError = require('@app/Helpers/AppError');
const Audit = require('@app/Helpers/audit');
const Settings = require('@app/Helpers/settings');
const { sequelize } = require('@app/Helpers/database');
const { PlatformSetting } = require('@app/Models');

// every group with its settings and current values (saved value, or the default)
const index = async () => {
  const output = [];

  const names = Object.keys(Settings.groups).sort((a, b) => Settings.groups[a].sortOrder - Settings.groups[b].sortOrder);
  for (const name of names) {
    output.push({ name, label: Settings.groups[name].label, values: await Settings.group(name), definitions: Settings.definitionsOf(name) });
  }

  return output;
};

const sameValue = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Saves the changed values of one group. `values` is already validated and converted by UpdateSettingsRequest.
// Everything is saved together, and every changed key gets its own audit entry.
const updateGroup = async (ctx, name, values) => {
  if (!Settings.groups[name]) throw AppError.notFound();

  const before = await Settings.group(name);

  await sequelize.transaction(async (transaction) => {
    for (const [key, value] of Object.entries(values)) {
      if (sameValue(before[key], value)) continue;

      const definition = Settings.definitionOf(key);
      let row = await PlatformSetting.findOne({ where: { settingKey: key }, transaction });

      if (row) {
        await row.update({ settingValue: value, updatedBy: ctx.admin.id }, { transaction });
      } else {
        row = await PlatformSetting.create(
          {
            settingKey: key,
            settingValue: value,
            settingGroup: name,
            description: definition.description,
            updatedBy: ctx.admin.id,
          },
          { transaction },
        );
      }

      await Audit.log(
        ctx,
        'setting.updated',
        {
          entityType: 'platform_setting',
          entityUuid: row.uuid,
          description: `Changed setting "${definition.label}"`,
          before: { key, value: before[key] },
          after: { key, value },
        },
        { transaction },
      );
    }
  });

  await Settings.refresh();

  return {
    name,
    label: Settings.groups[name].label,
    values: await Settings.group(name),
    definitions: Settings.definitionsOf(name),
  };
};

module.exports = { index, updateGroup };
