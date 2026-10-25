const AdminUser = require('./AdminUser');
const AdminPermission = require('./AdminPermission');
const AdminUserPermission = require('./AdminUserPermission');
const AdminSession = require('./AdminSession');
const AdminPasswordReset = require('./AdminPasswordReset');
const AdminLoginHistory = require('./AdminLoginHistory');

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

module.exports = {
  AppModule,
  Plan,
  PlanLimit,
  PlanModule,
  AdminUser,
  AdminPermission,
  AdminUserPermission,
  AdminSession,
  AdminPasswordReset,
  AdminLoginHistory,
};
