const { DataTypes, Sequelize } = require("sequelize");
const { timestampColumns, foreignKey, addIndexes } = require("../helpers");

module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable("inquiry_notes", {
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
      inquiry_id: foreignKey("inquiries", {
        allowNull: false,
        onDelete: "CASCADE",
      }),
      note: {
        type: DataTypes.TEXT,
        comment: "Internal note, never shown to the visitor",
      },
      created_by: foreignKey("admin_users", {
        comment: "Staff member who wrote the note",
      }),
      ...timestampColumns({ updatedAt: false }),
    });

    await addIndexes(queryInterface, "inquiry_notes", [
      "uuid",
      "inquiry_id",
      "created_by",
      ["inquiry_id", "created_at"],
    ]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("inquiry_notes");
  },
};
