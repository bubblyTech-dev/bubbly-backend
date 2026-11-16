const { DataTypes } = require('sequelize');

// School settings the Principal edits from the web workspace (Profile page): working days and hours, and the month
// the academic year starts in. The academic year label (for example 2026 - 2027) is worked out from that month.
module.exports = {
  async up(queryInterface) {
    await queryInterface.addColumn('clients', 'working_days', {
      type: DataTypes.STRING(20),
      defaultValue: '1,2,3,4,5',
      comment: 'Days the school is open, comma separated ISO weekdays: 1 Monday ... 7 Sunday',
    });
    await queryInterface.addColumn('clients', 'opens_at', {
      type: DataTypes.TIME,
      comment: 'Usual opening time',
    });
    await queryInterface.addColumn('clients', 'closes_at', {
      type: DataTypes.TIME,
      comment: 'Usual closing time',
    });
    await queryInterface.addColumn('clients', 'academic_year_start_month', {
      type: DataTypes.SMALLINT,
      defaultValue: 6,
      comment: 'Month the academic year starts: 1 January ... 12 December',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('clients', 'academic_year_start_month');
    await queryInterface.removeColumn('clients', 'closes_at');
    await queryInterface.removeColumn('clients', 'opens_at');
    await queryInterface.removeColumn('clients', 'working_days');
  },
};
