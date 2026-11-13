const { DataTypes, Sequelize } = require("sequelize");
const { timestampColumns, foreignKey, addIndexes } = require("../helpers");

// Our own GST invoices (Razorpay does not issue them). Seller and buyer details are copied at issue time, so an
// invoice never changes when a setting or an address changes later. Money is in paise.
module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable("invoices", {
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
      subscription_id: foreignKey("subscriptions", {
        onDelete: "SET NULL",
      }),
      payment_id: foreignKey("payments", {
        onDelete: "SET NULL",
      }),
      invoice_no: {
        type: DataTypes.STRING(40),
        comment: "Uniqueness is checked in code",
      },
      razorpay_invoice_id: {
        type: DataTypes.STRING(60),
      },
      status: {
        type: DataTypes.SMALLINT,
        defaultValue: 1,
        comment: "1: Draft, 2: Issued, 3: Paid, 4: Void",
      },
      issued_at: {
        type: DataTypes.DATE,
      },
      period_start: {
        type: DataTypes.DATE,
      },
      period_end: {
        type: DataTypes.DATE,
      },
      subtotal_paise: {
        type: DataTypes.BIGINT,
      },
      tax_paise: {
        type: DataTypes.BIGINT,
      },
      total_paise: {
        type: DataTypes.BIGINT,
      },
      tax_rate_percent: {
        type: DataTypes.DECIMAL(5, 2),
      },
      gst_number: {
        type: DataTypes.STRING(20),
        comment: "GST number of the school",
      },
      seller_gst_number: {
        type: DataTypes.STRING(20),
      },
      seller_name: {
        type: DataTypes.STRING(200),
      },
      seller_address: {
        type: DataTypes.TEXT,
      },
      buyer_name: {
        type: DataTypes.STRING(200),
      },
      buyer_address: {
        type: DataTypes.TEXT,
      },
      pdf_file: {
        type: DataTypes.STRING(120),
        comment: "File name only; the folder comes from config/files.js. Filled when the PDF is generated",
      },
      ...timestampColumns(),
    });

    await addIndexes(queryInterface, "invoices", [
      "uuid",
      "client_id",
      "subscription_id",
      "payment_id",
      "invoice_no",
      "razorpay_invoice_id",
      "status",
      "issued_at",
      ["client_id", "issued_at"],
    ]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("invoices");
  },
};
