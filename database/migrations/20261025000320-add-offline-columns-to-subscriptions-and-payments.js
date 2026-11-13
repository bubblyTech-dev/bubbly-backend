const { DataTypes } = require('sequelize');

// Lets a school pay outside Razorpay (bank transfer, cash, cheque, UPI) and be recorded by staff.
// Existing rows are Razorpay rows, so the new `source` columns default to 1.
module.exports = {
  async up(queryInterface) {
    await queryInterface.addColumn('subscriptions', 'source', {
      type: DataTypes.SMALLINT,
      defaultValue: 1,
      comment: '1: Razorpay, 2: Offline (recorded by staff, no Razorpay subscription)',
    });

    await queryInterface.addColumn('payments', 'source', {
      type: DataTypes.SMALLINT,
      defaultValue: 1,
      comment: '1: Razorpay, 2: Offline (recorded by staff)',
    });
    await queryInterface.addColumn('payments', 'recorded_by', {
      type: DataTypes.BIGINT,
      references: { model: 'admin_users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
      comment: 'Staff member who recorded an offline payment',
    });
    await queryInterface.addColumn('payments', 'reference', {
      type: DataTypes.STRING(120),
      comment: 'Bank reference, cheque number or UPI id of an offline payment',
    });
    await queryInterface.addColumn('payments', 'notes', {
      type: DataTypes.STRING(500),
      comment: 'Internal note on an offline payment',
    });

    await queryInterface.addIndex('subscriptions', ['source'], {
      name: 'subscriptions_source_idx',
    });
    await queryInterface.addIndex('subscriptions', ['source', 'status', 'current_period_end'], {
      name: 'subscriptions_source_status_current_period_end_idx',
    });
    await queryInterface.addIndex('payments', ['source'], {
      name: 'payments_source_idx',
    });
    await queryInterface.addIndex('payments', ['recorded_by'], {
      name: 'payments_recorded_by_idx',
    });
    await queryInterface.addIndex('payments', ['reference'], {
      name: 'payments_reference_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('payments', 'payments_reference_idx');
    await queryInterface.removeIndex('payments', 'payments_recorded_by_idx');
    await queryInterface.removeIndex('payments', 'payments_source_idx');
    await queryInterface.removeIndex('subscriptions', 'subscriptions_source_status_current_period_end_idx');
    await queryInterface.removeIndex('subscriptions', 'subscriptions_source_idx');
    await queryInterface.removeColumn('payments', 'notes');
    await queryInterface.removeColumn('payments', 'reference');
    await queryInterface.removeColumn('payments', 'recorded_by');
    await queryInterface.removeColumn('payments', 'source');
    await queryInterface.removeColumn('subscriptions', 'source');
  },
};
