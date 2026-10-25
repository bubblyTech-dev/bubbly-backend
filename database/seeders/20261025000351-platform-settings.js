const { QueryTypes } = require('sequelize');
const { definitions } = require('../../config/settings');

// Safe to run again: only inserts settings that are missing, never changes a value someone has saved.
module.exports = {
  async up(queryInterface) {
    const db = queryInterface.sequelize;

    const existing = await db.query('SELECT setting_key FROM platform_settings', { type: QueryTypes.SELECT });
    const have = new Set(existing.map((row) => row.setting_key));

    let added = 0;
    for (const definition of definitions) {
      if (have.has(definition.key)) continue;

      await db.query(
        `INSERT INTO platform_settings (setting_key, setting_value, setting_group, description)
         VALUES (:key, CAST(:value AS jsonb), :group, :description)`,
        {
          replacements: {
            key: definition.key,
            value: JSON.stringify(definition.default),
            group: definition.group,
            description: definition.description,
          },
        },
      );
      added += 1;
    }

    console.log(`  platform settings: ${added} added, ${definitions.length - added} already there`);
  },

  async down(queryInterface) {
    const keys = definitions.map((definition) => definition.key);
    await queryInterface.sequelize.query('DELETE FROM platform_settings WHERE setting_key IN (:keys)', { replacements: { keys } });
  },
};
