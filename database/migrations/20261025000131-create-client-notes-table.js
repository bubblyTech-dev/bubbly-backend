const { DataTypes, Sequelize } = require("sequelize");
const { timestampColumns, foreignKey, addIndexes } = require("../helpers");

// Internal notes about a school, written by Bubbly staff. The school never sees them.
module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable("client_notes", {
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
      note: {
        type: DataTypes.TEXT,
      },
      created_by: foreignKey("admin_users", {
        comment: "Who wrote the note",
      }),
      ...timestampColumns({ deletedAt: true }),
    });

    await addIndexes(queryInterface, "client_notes", [
      "uuid",
      "client_id",
      "created_by",
      "deleted_at",
      ["client_id", "created_at"],
    ]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("client_notes");
  },
};
