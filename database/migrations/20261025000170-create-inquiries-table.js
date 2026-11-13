const { DataTypes, Sequelize } = require("sequelize");
const { timestampColumns, foreignKey, addIndexes } = require("../helpers");

module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable("inquiries", {
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
      name: {
        type: DataTypes.STRING(150),
      },
      email: {
        type: DataTypes.STRING(190),
      },
      phone: {
        type: DataTypes.STRING(30),
      },
      school_name: {
        type: DataTypes.STRING(190),
      },
      message: {
        type: DataTypes.TEXT,
      },
      source: {
        type: DataTypes.SMALLINT,
        defaultValue: 1,
        comment: "1: Contact form, 2: Demo request, 3: Pricing page",
      },
      status: {
        type: DataTypes.SMALLINT,
        defaultValue: 1,
        comment: "1: New, 2: In progress, 3: Resolved, 4: Spam",
      },
      assigned_to: foreignKey("admin_users", {
        comment: "Staff member handling this inquiry",
      }),
      resolved_at: {
        type: DataTypes.DATE,
        comment: "Set when the status becomes Resolved",
      },
      ip_address: {
        type: DataTypes.STRING(64),
      },
      user_agent: {
        type: DataTypes.STRING(400),
      },
      ...timestampColumns({ deletedAt: true }),
    });

    await addIndexes(queryInterface, "inquiries", [
      "uuid",
      "email",
      "name",
      "school_name",
      "source",
      "status",
      "assigned_to",
      "created_at",
      "deleted_at",
      ["status", "created_at"],
    ]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("inquiries");
  },
};
