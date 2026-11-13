const { DataTypes, Sequelize } = require("sequelize");
const { timestampColumns, foreignKey, addIndexes } = require("../helpers");

// Every payment attempt Razorpay reports for a subscription. Money is in paise.
module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable("payments", {
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
      razorpay_payment_id: {
        type: DataTypes.STRING(60),
      },
      razorpay_order_id: {
        type: DataTypes.STRING(60),
      },
      razorpay_invoice_id: {
        type: DataTypes.STRING(60),
      },
      razorpay_refund_id: {
        type: DataTypes.STRING(60),
      },
      status: {
        type: DataTypes.SMALLINT,
        defaultValue: 1,
        comment: "1: Created, 2: Authorized, 3: Captured, 4: Failed, 5: Refunded, 6: Partially refunded",
      },
      method: {
        type: DataTypes.STRING(30),
        comment: "For example upi, card, netbanking",
      },
      amount_paise: {
        type: DataTypes.BIGINT,
      },
      currency: {
        type: DataTypes.STRING(3),
        defaultValue: "INR",
      },
      fee_paise: {
        type: DataTypes.BIGINT,
        comment: "Razorpay fee",
      },
      tax_paise: {
        type: DataTypes.BIGINT,
        comment: "Tax on the Razorpay fee",
      },
      refunded_paise: {
        type: DataTypes.BIGINT,
        defaultValue: 0,
      },
      failure_code: {
        type: DataTypes.STRING(100),
      },
      failure_reason: {
        type: DataTypes.STRING(500),
      },
      paid_at: {
        type: DataTypes.DATE,
      },
      gateway_data: {
        type: DataTypes.JSONB,
        comment: "Last Razorpay payment object. Never holds card details",
      },
      ...timestampColumns(),
    });

    await addIndexes(queryInterface, "payments", [
      "uuid",
      "client_id",
      "subscription_id",
      "status",
      "razorpay_payment_id",
      "razorpay_order_id",
      "razorpay_invoice_id",
      "razorpay_refund_id",
      "paid_at",
      ["client_id", "created_at"],
    ]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("payments");
  },
};
