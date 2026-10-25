const AdminUser = require('./AdminUser');
const AdminPermission = require('./AdminPermission');
const AdminUserPermission = require('./AdminUserPermission');
const AdminSession = require('./AdminSession');
const AdminPasswordReset = require('./AdminPasswordReset');
const AdminLoginHistory = require('./AdminLoginHistory');
const Inquiry = require('./Inquiry');
const InquiryNote = require('./InquiryNote');

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

// inquiries
Inquiry.hasMany(InquiryNote, { foreignKey: 'inquiryId', as: 'notes' });
InquiryNote.belongsTo(Inquiry, { foreignKey: 'inquiryId', as: 'inquiry' });
Inquiry.belongsTo(AdminUser, { foreignKey: 'assignedTo', as: 'assignee' });
InquiryNote.belongsTo(AdminUser, { foreignKey: 'createdBy', as: 'author' });

module.exports = {
  AdminUser,
  AdminPermission,
  AdminUserPermission,
  AdminSession,
  AdminPasswordReset,
  AdminLoginHistory,
  Inquiry,
  InquiryNote,
};
