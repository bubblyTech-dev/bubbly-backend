const AdminUser = require('./AdminUser');
const AdminPermission = require('./AdminPermission');
const AdminUserPermission = require('./AdminUserPermission');
const AdminSession = require('./AdminSession');
const AdminPasswordReset = require('./AdminPasswordReset');
const AdminLoginHistory = require('./AdminLoginHistory');
const Announcement = require('./Announcement');
const AnnouncementTarget = require('./AnnouncementTarget');

// relationships (the database columns are plain indexed foreign keys; these are for loading related rows)
AdminUser.hasMany(AdminSession, { foreignKey: 'adminUserId', as: 'sessions' });
AdminSession.belongsTo(AdminUser, { foreignKey: 'adminUserId', as: 'adminUser' });

AdminUser.hasMany(AdminPasswordReset, { foreignKey: 'adminUserId', as: 'passwordResets' });
AdminPasswordReset.belongsTo(AdminUser, { foreignKey: 'adminUserId', as: 'adminUser' });

AdminUser.hasMany(AdminLoginHistory, { foreignKey: 'adminUserId', as: 'loginHistory' });
AdminLoginHistory.belongsTo(AdminUser, { foreignKey: 'adminUserId', as: 'adminUser' });

AdminUser.belongsToMany(AdminPermission, {
  through: AdminUserPermission,
  foreignKey: 'adminUserId',
  otherKey: 'adminPermissionId',
  as: 'permissions',
});
AdminPermission.belongsToMany(AdminUser, {
  through: AdminUserPermission,
  foreignKey: 'adminPermissionId',
  otherKey: 'adminUserId',
  as: 'adminUsers',
});

// announcements and who they are aimed at
Announcement.hasMany(AnnouncementTarget, { foreignKey: 'announcementId', as: 'targets' });
AnnouncementTarget.belongsTo(Announcement, { foreignKey: 'announcementId', as: 'announcement' });
Announcement.belongsTo(AdminUser, { foreignKey: 'createdBy', as: 'creator' });

module.exports = {
  Announcement,
  AnnouncementTarget,
  AdminUser,
  AdminPermission,
  AdminUserPermission,
  AdminSession,
  AdminPasswordReset,
  AdminLoginHistory,
};
