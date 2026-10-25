// Every permission an admin can be given. Defined here, synced to the admin_permissions table by the seeder.
// The Users & Access screen shows these as checkboxes grouped by module. The master admin always has all of them.
// Format: module -> [key, label]

const adminPermissionGroups = {
  dashboard: [['dashboard.view', 'View dashboard']],
  schools: [
    ['schools.view', 'View schools'],
    ['schools.create', 'Add a school'],
    ['schools.edit', 'Edit school details'],
    ['schools.status', 'Suspend, reactivate or archive a school'],
    ['schools.notes', 'Add internal notes'],
    ['schools.usage', 'View usage'],
    ['schools.delete', 'Delete a school'],
  ],
  support_access: [
    ['support_access.view', 'View support access grants'],
    ['support_access.request', 'Request access to a school'],
    ['support_access.approve', 'Approve or revoke support access'],
  ],
  plans: [
    ['plans.view', 'View plans'],
    ['plans.create', 'Create a plan'],
    ['plans.edit', 'Edit a plan'],
    ['plans.publish', 'Publish a plan'],
    ['plans.archive', 'Archive a plan'],
  ],
  modules: [
    ['modules.view', 'View modules'],
    ['modules.edit', 'Edit modules'],
  ],
  subscriptions: [
    ['subscriptions.view', 'View subscriptions'],
    ['subscriptions.manage', 'Change subscriptions'],
  ],
  renewals: [
    ['renewals.view', 'View renewals'],
    ['renewals.manage', 'Manage renewals'],
  ],
  billing: [
    ['billing.view', 'View payments and invoices'],
    ['billing.record_payment', 'Record an offline payment'],
    ['billing.refund', 'Issue refunds'],
    ['billing.invoices_download', 'Download invoices'],
  ],
  inquiries: [
    ['inquiries.view', 'View inquiries'],
    ['inquiries.manage', 'Manage inquiries'],
  ],
  announcements: [
    ['announcements.view', 'View announcements'],
    ['announcements.manage', 'Manage announcements'],
  ],
  settings: [
    ['settings.view', 'View settings'],
    ['settings.edit', 'Edit settings'],
  ],
  audit: [['audit.view', 'View the audit log']],
  reports: [
    ['reports.view', 'View reports'],
    ['reports.export', 'Export reports'],
  ],
  users_access: [
    ['users_access.view', 'View staff'],
    ['users_access.create', 'Add staff'],
    ['users_access.edit', 'Edit staff details'],
    ['users_access.status', 'Activate or deactivate staff'],
    ['users_access.reset_password', 'Set a new password for staff'],
    ['users_access.permissions', 'Change staff permissions'],
    ['users_access.sessions', 'View and end staff sessions'],
    ['users_access.login_history', 'View staff login history'],
    ['users_access.delete', 'Remove staff'],
  ],
};

// flat list used by the seeder
const adminPermissions = Object.entries(adminPermissionGroups).flatMap(([module, items], groupIndex) =>
  items.map(([key, name], i) => ({ key, name, module, sortOrder: groupIndex * 100 + i })),
);

module.exports = { adminPermissionGroups, adminPermissions };
