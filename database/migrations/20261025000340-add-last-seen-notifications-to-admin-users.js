const { DataTypes } = require('sequelize');

// Remembers when an admin last opened the notification bell, so the bell can show how many items are new for them.
module.exports = {
  async up(queryInterface) {
    await queryInterface.addColumn('admin_users', 'last_seen_notifications_at', {
      type: DataTypes.DATE,
      comment: 'When the admin last marked the notification bell as read',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('admin_users', 'last_seen_notifications_at');
  },
};
