const { DataTypes, Sequelize } = require("sequelize");
const { timestampColumns, foreignKey, addIndexes } = require("../helpers");

// One row per school subscription. Money is in paise. The status only changes from verified Razorpay events
// (or a manual sync), never from the browser.
module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable("subscriptions", {
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
      plan_id: foreignKey("plans", {
        allowNull: false,
        onDelete: "RESTRICT",
      }),
      status: {
        type: DataTypes.SMALLINT,
        defaultValue: 1,
        comment: "1: Pending, 2: Active, 3: Past due, 4: Cancelled, 5: Expired, 6: Suspended",
      },
      razorpay_subscription_id: {
        type: DataTypes.STRING(60),
        comment: "Id of the subscription on Razorpay",
      },
      razorpay_plan_id: {
        type: DataTypes.STRING(60),
        comment: "Razorpay plan this subscription was created from",
      },
      razorpay_customer_id: {
        type: DataTypes.STRING(60),
        comment: "Razorpay customer that pays",
      },
      billing_interval: {
        type: DataTypes.SMALLINT,
        comment: "Copy of the plan at purchase. 1: Monthly, 2: Quarterly, 3: Yearly",
      },
      amount_paise: {
        type: DataTypes.BIGINT,
        comment: "Price of one period at purchase, in paise",
      },
      currency: {
        type: DataTypes.STRING(3),
        defaultValue: "INR",
      },
      total_count: {
        type: DataTypes.INTEGER,
        comment: "Number of billing cycles Razorpay may charge in total",
      },
      paid_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      remaining_count: {
        type: DataTypes.INTEGER,
      },
      started_at: {
        type: DataTypes.DATE,
      },
      current_period_start: {
        type: DataTypes.DATE,
      },
      current_period_end: {
        type: DataTypes.DATE,
      },
      next_charge_at: {
        type: DataTypes.DATE,
      },
      cancel_at_cycle_end: {
        type: DataTypes.SMALLINT,
        defaultValue: 0,
        comment: "1: Yes (ends after the current period), 0: No",
      },
      cancel_requested_at: {
        type: DataTypes.DATE,
      },
      cancelled_at: {
        type: DataTypes.DATE,
      },
      ended_at: {
        type: DataTypes.DATE,
      },
      short_url: {
        type: DataTypes.STRING(300),
        comment: "Razorpay page where the school authorises the payment",
      },
      gateway_data: {
        type: DataTypes.JSONB,
        comment: "Last Razorpay subscription object. Never holds keys or secrets",
      },
      created_by: foreignKey("admin_users", {
        comment: "Which admin created it",
      }),
      ...timestampColumns({ deletedAt: true }),
    });

    await addIndexes(queryInterface, "subscriptions", [
      "uuid",
      "client_id",
      "plan_id",
      "status",
      "razorpay_subscription_id",
      "razorpay_plan_id",
      "razorpay_customer_id",
      "next_charge_at",
      "created_by",
      "deleted_at",
      ["client_id", "status"],
    ]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("subscriptions");
  },
};
