const { DataTypes } = require("sequelize");

// Remembers the Razorpay ids on rows that already exist: the plan on Razorpay and the school as a Razorpay customer.
module.exports = {
  async up(queryInterface) {
    await queryInterface.addColumn("plans", "razorpay_plan_id", {
      type: DataTypes.STRING(60),
      comment: "Id of this plan on Razorpay. Razorpay plans cannot be edited, so it is created once",
    });
    await queryInterface.addColumn("plans", "razorpay_synced_at", {
      type: DataTypes.DATE,
      comment: "When the plan was created on Razorpay",
    });
    await queryInterface.addColumn("clients", "razorpay_customer_id", {
      type: DataTypes.STRING(60),
      comment: "Id of this school as a Razorpay customer",
    });

    await queryInterface.addIndex("plans", ["razorpay_plan_id"], {
      name: "plans_razorpay_plan_id_idx",
    });
    await queryInterface.addIndex("clients", ["razorpay_customer_id"], {
      name: "clients_razorpay_customer_id_idx",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("clients", "clients_razorpay_customer_id_idx");
    await queryInterface.removeIndex("plans", "plans_razorpay_plan_id_idx");
    await queryInterface.removeColumn("clients", "razorpay_customer_id");
    await queryInterface.removeColumn("plans", "razorpay_synced_at");
    await queryInterface.removeColumn("plans", "razorpay_plan_id");
  },
};
