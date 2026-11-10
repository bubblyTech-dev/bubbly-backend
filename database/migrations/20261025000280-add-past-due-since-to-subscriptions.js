const { DataTypes } = require("sequelize");

// Remembers when a subscription became Past due, so the Renewals page can tell how much of the grace period is left.
// It is set when the status changes to Past due and cleared when the status changes to anything else.
module.exports = {
  async up(queryInterface) {
    await queryInterface.addColumn("subscriptions", "past_due_since", {
      type: DataTypes.DATE,
      comment: "When the subscription became Past due. Empty when it is not Past due",
    });

    await queryInterface.addIndex("subscriptions", ["past_due_since"], {
      name: "subscriptions_past_due_since_idx",
    });

    // subscriptions that are already Past due start counting from their last change
    await queryInterface.sequelize.query(
      "UPDATE subscriptions SET past_due_since = updated_at WHERE status = 3 AND past_due_since IS NULL",
    );
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("subscriptions", "subscriptions_past_due_since_idx");
    await queryInterface.removeColumn("subscriptions", "past_due_since");
  },
};
