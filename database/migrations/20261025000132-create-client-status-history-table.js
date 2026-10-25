const { DataTypes, Sequelize } = require("sequelize");
const { timestampColumns, foreignKey, addIndexes } = require("../helpers");

// Every suspend, reactivate and archive of a school, with the reason. Append-only.
module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable("client_status_history", {
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
      client_id: foreignKey("clients", {
        allowNull: false,
        onDelete: "CASCADE",
      }),
      from_status: {
        type: DataTypes.SMALLINT,
        comment: "1: Active, 2: Suspended, 3: Archived",
      },
      to_status: {
        type: DataTypes.SMALLINT,
        comment: "1: Active, 2: Suspended, 3: Archived",
      },
      reason: {
        type: DataTypes.STRING(500),
      },
      changed_by: foreignKey("admin_users", {
        comment: "Which admin made the change",
      }),
      ...timestampColumns({ updatedAt: false }),
    });

    await addIndexes(queryInterface, "client_status_history", [
      "uuid",
      "client_id",
      "to_status",
      "changed_by",
      ["client_id", "created_at"],
    ]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("client_status_history");
  },
};
