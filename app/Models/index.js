const AdminUser = require('./AdminUser');
const AdminPermission = require('./AdminPermission');
const AdminUserPermission = require('./AdminUserPermission');
const AdminSession = require('./AdminSession');
const AdminPasswordReset = require('./AdminPasswordReset');
const AdminLoginHistory = require('./AdminLoginHistory');
const AuditLog = require('./AuditLog');
const PlatformSetting = require('./PlatformSetting');
const Client = require('./Client');
const ClientNote = require('./ClientNote');
const ClientStatusHistory = require('./ClientStatusHistory');
const Inquiry = require('./Inquiry');
const InquiryNote = require('./InquiryNote');
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

// Plans and modules
const AppModule = require('./AppModule');
const Plan = require('./Plan');
const PlanLimit = require('./PlanLimit');
const PlanModule = require('./PlanModule');

Plan.hasMany(PlanLimit, { foreignKey: 'planId', as: 'limits' });
PlanLimit.belongsTo(Plan, { foreignKey: 'planId', as: 'plan' });
Plan.hasMany(PlanModule, { foreignKey: 'planId', as: 'planModules' });
PlanModule.belongsTo(Plan, { foreignKey: 'planId', as: 'plan' });
PlanModule.belongsTo(AppModule, { foreignKey: 'moduleId', as: 'module' });
AppModule.hasMany(PlanModule, { foreignKey: 'moduleId', as: 'planModules' });
// inquiries
Inquiry.hasMany(InquiryNote, { foreignKey: 'inquiryId', as: 'notes' });
InquiryNote.belongsTo(Inquiry, { foreignKey: 'inquiryId', as: 'inquiry' });
Inquiry.belongsTo(AdminUser, { foreignKey: 'assignedTo', as: 'assignee' });
InquiryNote.belongsTo(AdminUser, { foreignKey: 'createdBy', as: 'author' });

module.exports = {
  AppModule,
  Plan,
  PlanLimit,
  PlanModule,
// schools (clients)
Client.hasMany(ClientNote, { foreignKey: 'clientId', as: 'notes' });
ClientNote.belongsTo(Client, { foreignKey: 'clientId', as: 'client' });
ClientNote.belongsTo(AdminUser, { foreignKey: 'createdBy', as: 'creator' });

Client.hasMany(ClientStatusHistory, { foreignKey: 'clientId', as: 'statusHistory' });
ClientStatusHistory.belongsTo(Client, { foreignKey: 'clientId', as: 'client' });
ClientStatusHistory.belongsTo(AdminUser, { foreignKey: 'changedBy', as: 'changer' });

module.exports = {
  Client,
  ClientNote,
  ClientStatusHistory,
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
  AuditLog,
  PlatformSetting,
  Inquiry,
  InquiryNote,
};
