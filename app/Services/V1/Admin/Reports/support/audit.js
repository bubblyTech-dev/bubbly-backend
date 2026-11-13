const { NO } = require('@app/Helpers/constants');
const { isMaster, jsonNumber } = require('./common');

// Shared by the two Audit reports.

// The audit log hides everything the MASTER admin did from every other admin (the same rule as AuditLogService.list).
// Returns a piece of SQL for `l` = audit_logs (empty for a master viewer).
const visibleToViewer = (ctx) => (isMaster(ctx) ? '' : `(l.actor_is_master = ${NO} OR l.actor_is_master IS NULL)`);

const ENTITY_LABELS = {
  admin_user: 'Staff account',
  announcement: 'Announcement',
  inquiry: 'Inquiry',
  invoice: 'Invoice',
  module: 'Module',
  payment: 'Payment',
  plan: 'Plan',
  platform_setting: 'Setting',
  report: 'Report download',
  school: 'School',
  subscription: 'Subscription',
  user: 'School user',
  webhook_event: 'Webhook event',
};

const ACTOR_LABELS = { 1: 'Admin', 2: 'School user', 3: 'System' };

// The actions that matter most for control and money, with plain words and a group.
const SENSITIVE_ACTIONS = {
  'payment.refunded': { label: 'Refund issued', category: 'Money' },
  'payment.recorded_offline': { label: 'Offline payment recorded', category: 'Money' },
  'subscription.cancel_requested': { label: 'Subscription cancel requested', category: 'Subscriptions' },
  'subscription.expiry_changed': { label: 'Subscription expiry changed', category: 'Subscriptions' },
  'admin_user.created': { label: 'Staff account added', category: 'Access' },
  'admin_user.permissions_changed': { label: 'Permissions changed', category: 'Access' },
  'admin_user.password_reset': { label: 'Staff password reset', category: 'Access' },
  'admin_user.status_changed': { label: 'Staff account switched on or off', category: 'Access' },
  'admin_user.sessions_revoked': { label: 'Staff signed out everywhere', category: 'Access' },
  'admin_user.deleted': { label: 'Staff account removed', category: 'Access' },
  'school.status_changed': { label: 'School status changed', category: 'Schools' },
  'school.deleted': { label: 'School deleted', category: 'Schools' },
  'school.principal_password_reset': { label: 'Principal password reset', category: 'Schools' },
  'school.principal_welcome_resent': { label: 'Principal welcome link resent', category: 'Schools' },
  'plan.published': { label: 'Plan published', category: 'Plans' },
  'plan.archived': { label: 'Plan archived', category: 'Plans' },
  'plan.deleted': { label: 'Plan deleted', category: 'Plans' },
  'setting.updated': { label: 'Setting changed', category: 'Settings' },
  'webhook_event.reprocessed': { label: 'Webhook event processed again', category: 'System' },
  'report.exported': { label: 'Report downloaded', category: 'Data' },
};

const CATEGORIES = [...new Set(Object.values(SENSITIVE_ACTIONS).map((item) => item.category))];

module.exports = { visibleToViewer, ENTITY_LABELS, ACTOR_LABELS, SENSITIVE_ACTIONS, CATEGORIES };
