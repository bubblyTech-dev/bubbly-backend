const { DataTypes, Sequelize } = require("sequelize");
const { timestampColumns, foreignKey, addIndexes } = require("../helpers");

// A client is one school (the tenant). Every school-owned table elsewhere points here with client_id.
module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable("clients", {
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
      slug: {
        type: DataTypes.STRING(100),
        comment: "Short name for addresses. Uniqueness is checked in code",
      },
      status: {
        type: DataTypes.SMALLINT,
        defaultValue: 1,
        comment: "1: Active, 2: Suspended, 3: Archived",
      },
      contact_name: {
        type: DataTypes.STRING(150),
      },
      contact_email: {
        type: DataTypes.STRING(190),
      },
      contact_phone: {
        type: DataTypes.STRING(30),
      },
      address_line1: {
        type: DataTypes.STRING(200),
      },
      address_line2: {
        type: DataTypes.STRING(200),
      },
      city: {
        type: DataTypes.STRING(100),
      },
      state: {
        type: DataTypes.STRING(100),
      },
      postal_code: {
        type: DataTypes.STRING(20),
      },
      country: {
        type: DataTypes.STRING(100),
      },
      gst_number: {
        type: DataTypes.STRING(20),
      },
      logo: {
        type: DataTypes.STRING(120),
        comment: "File name only (date and time + random). The folder comes from config/files.js",
      },
      timezone: {
        type: DataTypes.STRING(60),
        defaultValue: "Asia/Kolkata",
      },
      created_by: foreignKey("admin_users", {
        comment: "Which admin added the school",
      }),
      updated_by: foreignKey("admin_users", {
        comment: "Which admin changed it last",
      }),
      ...timestampColumns({ deletedAt: true }),
    });

    await addIndexes(queryInterface, "clients", [
      "uuid",
      "slug",
      "name",
      "status",
      "contact_email",
      "created_by",
      "updated_by",
      "deleted_at",
      ["status", "created_at"],
    ]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("clients");
  },
};
