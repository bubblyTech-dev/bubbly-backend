const { DataTypes } = require('sequelize');
const { foreignKey, addIndexes } = require('../helpers');

// A plan feature line can optionally unlock a module. The plan's plan_modules rows are rebuilt from these links
// (core modules are always included). Existing features stay unlinked (empty); nothing is guessed.
module.exports = {
  async up(queryInterface) {
    await queryInterface.addColumn('plan_features', 'module_id', {
      ...foreignKey('modules', { comment: 'Optional app_modules.id this feature line unlocks. Empty means the line is text only' }),
      type: DataTypes.BIGINT,
    });
    await addIndexes(queryInterface, 'plan_features', ['module_id']);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('plan_features', 'module_id');
  },
};
