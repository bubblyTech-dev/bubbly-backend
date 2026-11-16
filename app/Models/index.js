const AdminUser = require('./AdminUser');
const AdminPermission = require('./AdminPermission');
const AdminUserPermission = require('./AdminUserPermission');
const AdminSession = require('./AdminSession');
const AdminPasswordReset = require('./AdminPasswordReset');
const AdminLoginHistory = require('./AdminLoginHistory');
const AuditLog = require('./AuditLog');
const PlatformSetting = require('./PlatformSetting');
const AppModule = require('./AppModule');
const Plan = require('./Plan');
const PlanLimit = require('./PlanLimit');
const PlanModule = require('./PlanModule');
const PlanFeature = require('./PlanFeature');
const Client = require('./Client');
const ClientNote = require('./ClientNote');
const ClientStatusHistory = require('./ClientStatusHistory');
const ClientModule = require('./ClientModule');
const ClientLimit = require('./ClientLimit');
const Inquiry = require('./Inquiry');
const InquiryNote = require('./InquiryNote');
const Announcement = require('./Announcement');
const AnnouncementTarget = require('./AnnouncementTarget');
const User = require('./User');
const UserSession = require('./UserSession');
const UserPasswordReset = require('./UserPasswordReset');
const UserLoginHistory = require('./UserLoginHistory');
const Subscription = require('./Subscription');
const Payment = require('./Payment');
const Invoice = require('./Invoice');
const WebhookEvent = require('./WebhookEvent');
const InvoiceCounter = require('./InvoiceCounter');
const SchoolClass = require('./SchoolClass');
const TeacherProfile = require('./TeacherProfile');
const Student = require('./Student');
const StaffAttendance = require('./StaffAttendance');

// relationships (the database columns are plain indexed foreign keys; these are for loading related rows)

// admin accounts
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

// plans and modules
Plan.hasMany(PlanLimit, { foreignKey: 'planId', as: 'limits' });
PlanLimit.belongsTo(Plan, { foreignKey: 'planId', as: 'plan' });
Plan.hasMany(PlanFeature, { foreignKey: 'planId', as: 'features' });
PlanFeature.belongsTo(Plan, { foreignKey: 'planId', as: 'plan' });
Plan.hasMany(PlanModule, { foreignKey: 'planId', as: 'planModules' });
PlanModule.belongsTo(Plan, { foreignKey: 'planId', as: 'plan' });
PlanModule.belongsTo(AppModule, { foreignKey: 'moduleId', as: 'module' });
PlanFeature.belongsTo(AppModule, { foreignKey: 'moduleId', as: 'module' });
AppModule.hasMany(PlanModule, { foreignKey: 'moduleId', as: 'planModules' });

// schools (clients)
Client.hasMany(ClientNote, { foreignKey: 'clientId', as: 'notes' });
ClientNote.belongsTo(Client, { foreignKey: 'clientId', as: 'client' });
ClientNote.belongsTo(AdminUser, { foreignKey: 'createdBy', as: 'creator' });

Client.hasMany(ClientStatusHistory, { foreignKey: 'clientId', as: 'statusHistory' });
ClientStatusHistory.belongsTo(Client, { foreignKey: 'clientId', as: 'client' });
ClientStatusHistory.belongsTo(AdminUser, { foreignKey: 'changedBy', as: 'changer' });

// per-school overrides
ClientModule.belongsTo(AppModule, { foreignKey: 'moduleId', as: 'module' });
ClientModule.belongsTo(AdminUser, { foreignKey: 'createdBy', as: 'creator' });
ClientLimit.belongsTo(AdminUser, { foreignKey: 'createdBy', as: 'creator' });

// inquiries
Inquiry.hasMany(InquiryNote, { foreignKey: 'inquiryId', as: 'notes' });
InquiryNote.belongsTo(Inquiry, { foreignKey: 'inquiryId', as: 'inquiry' });
Inquiry.belongsTo(AdminUser, { foreignKey: 'assignedTo', as: 'assignee' });
InquiryNote.belongsTo(AdminUser, { foreignKey: 'createdBy', as: 'author' });

// announcements and who they are aimed at
Announcement.hasMany(AnnouncementTarget, { foreignKey: 'announcementId', as: 'targets' });
AnnouncementTarget.belongsTo(Announcement, { foreignKey: 'announcementId', as: 'announcement' });
Announcement.belongsTo(AdminUser, { foreignKey: 'createdBy', as: 'creator' });

// subscriptions, payments and invoices
Subscription.belongsTo(Client, { foreignKey: 'clientId', as: 'client' });
Client.hasMany(Subscription, { foreignKey: 'clientId', as: 'subscriptions' });
Subscription.belongsTo(Plan, { foreignKey: 'planId', as: 'plan' });
Plan.hasMany(Subscription, { foreignKey: 'planId', as: 'subscriptions' });
Subscription.belongsTo(AdminUser, { foreignKey: 'createdBy', as: 'creator' });
Subscription.hasMany(Payment, { foreignKey: 'subscriptionId', as: 'payments' });
Payment.belongsTo(Subscription, { foreignKey: 'subscriptionId', as: 'subscription' });
Payment.belongsTo(Client, { foreignKey: 'clientId', as: 'client' });
Payment.belongsTo(AdminUser, { foreignKey: 'recordedBy', as: 'recorder' });
Subscription.hasMany(Invoice, { foreignKey: 'subscriptionId', as: 'invoices' });
Invoice.belongsTo(Subscription, { foreignKey: 'subscriptionId', as: 'subscription' });
Invoice.belongsTo(Payment, { foreignKey: 'paymentId', as: 'payment' });
Invoice.belongsTo(Client, { foreignKey: 'clientId', as: 'client' });

// school users (every one belongs to a school: Client)
Client.hasMany(User, { foreignKey: 'clientId', as: 'users' });
User.belongsTo(Client, { foreignKey: 'clientId', as: 'client' });
User.hasMany(UserSession, { foreignKey: 'userId', as: 'sessions' });
UserSession.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(UserPasswordReset, { foreignKey: 'userId', as: 'passwordResets' });
UserPasswordReset.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(UserLoginHistory, { foreignKey: 'userId', as: 'loginHistory' });
UserLoginHistory.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// school records: classes, teachers (User + TeacherProfile), students and staff attendance
SchoolClass.belongsTo(User, { foreignKey: 'classTeacherId', as: 'classTeacher' });
User.hasMany(SchoolClass, { foreignKey: 'classTeacherId', as: 'classesTaught' });
User.hasOne(TeacherProfile, { foreignKey: 'userId', as: 'teacherProfile' });
TeacherProfile.belongsTo(User, { foreignKey: 'userId', as: 'user' });
SchoolClass.hasMany(Student, { foreignKey: 'classId', as: 'students' });
Student.belongsTo(SchoolClass, { foreignKey: 'classId', as: 'schoolClass' });
Student.belongsTo(User, { foreignKey: 'userId', as: 'login' });
User.hasOne(Student, { foreignKey: 'userId', as: 'student' });
User.hasMany(StaffAttendance, { foreignKey: 'userId', as: 'staffAttendance' });
StaffAttendance.belongsTo(User, { foreignKey: 'userId', as: 'user' });

module.exports = {
  AdminUser,
  AdminPermission,
  AdminUserPermission,
  AdminSession,
  AdminPasswordReset,
  AdminLoginHistory,
  AuditLog,
  PlatformSetting,
  AppModule,
  Plan,
  PlanLimit,
  PlanModule,
  PlanFeature,
  Client,
  ClientNote,
  ClientStatusHistory,
  ClientModule,
  ClientLimit,
  Inquiry,
  InquiryNote,
  Announcement,
  AnnouncementTarget,
  Subscription,
  Payment,
  Invoice,
  WebhookEvent,
  User,
  UserSession,
  UserPasswordReset,
  UserLoginHistory,
  InvoiceCounter,
  SchoolClass,
  TeacherProfile,
  Student,
  StaffAttendance,
};
