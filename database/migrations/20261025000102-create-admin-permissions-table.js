const { DataTypes, Sequelize } = require("sequelize");
const { timestampColumns, addIndexes } = require("../helpers");

module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable("admin_permissions", {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
        comment: "Internal key, used for joins only",
      },
      uuid: {
        type: DataTypes.UUID,
        allowNull: false,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        comment: "Public id, the only id the API uses",
      },
      permission_key: {
        type: DataTypes.STRING(100),
        comment: "For example plans.edit",
      },
      name: {
        type: DataTypes.STRING(150),
        comment: "Label shown next to the checkbox",
      },
      module: {
        type: DataTypes.STRING(60),
        comment: "Group in the checklist",
      },
      description: {
        type: DataTypes.STRING(300),
      },
      sort_order: {
        type: DataTypes.INTEGER,
      },
      ...timestampColumns(),
    });

    await addIndexes(queryInterface, "admin_permissions", [
      "uuid",
      "permission_key",
      "module",
    ]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("admin_permissions");
  },
};
