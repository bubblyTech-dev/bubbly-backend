const { DataTypes, Sequelize } = require("sequelize");
const { timestampColumns, foreignKey, addIndexes } = require("../helpers");

// Every call Razorpay makes to our webhook is stored first, then processed. The table is created now;
// the processing is built later (see app/Services/V1/Common/Webhooks).
module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable("webhook_events", {
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
      provider: {
        type: DataTypes.STRING(30),
        defaultValue: "razorpay",
      },
      event_id: {
        type: DataTypes.STRING(80),
        comment: "Id Razorpay gives the event. Duplicates are skipped in code, not by the database",
      },
      event_type: {
        type: DataTypes.STRING(80),
        comment: "For example subscription.charged",
      },
      status: {
        type: DataTypes.SMALLINT,
        defaultValue: 1,
        comment: "1: Received, 2: Processed, 3: Failed, 4: Ignored",
      },
      payload: {
        type: DataTypes.JSONB,
        comment: "The event as received. Never holds our keys",
      },
      signature_valid: {
        type: DataTypes.SMALLINT,
        comment: "1: Yes, 0: No",
      },
      attempts: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      received_at: {
        type: DataTypes.DATE,
      },
      processed_at: {
        type: DataTypes.DATE,
      },
      error_message: {
        type: DataTypes.STRING(500),
      },
      ...timestampColumns(),
    });

    await addIndexes(queryInterface, "webhook_events", [
      "uuid",
      "provider",
      "event_id",
      "event_type",
      "status",
      "received_at",
      ["provider", "event_id"],
    ]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("webhook_events");
  },
};
