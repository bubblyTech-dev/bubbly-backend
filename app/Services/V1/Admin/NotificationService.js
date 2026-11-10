const { Op } = require('sequelize');
const safeSetting = require('@app/Helpers/safeSetting');
const { AdminUser, Client, Inquiry, Payment, Subscription } = require('@app/Models');
const { INQUIRY_STATUS, PAYMENT_STATUS, SUBSCRIPTION_STATUS } = require('@app/Helpers/constants');
const NotificationResource = require('@app/Resources/V1/Admin/NotificationResource');

// What the header bell shows. Nothing is stored per notification: the list is built from live data, so it always
// matches reality (an inquiry that was answered simply drops out).
//
//   - new inquiries            need inquiries.view and the setting notifications.show_new_inquiries
//   - failed payments and subscriptions that are past due
//                              need billing.view and the setting notifications.show_failed_payments
//
// "Unread" are the items newer than the moment the admin last pressed "Mark all as read" (admin_users.last_seen_notifications_at).
// A missing setting counts as on, so the bell works before anyone has saved those settings.

const MAX_ITEMS = 20;
const FAILED_PAYMENT_LOOKBACK_DAYS = 14; // an old failed payment is history, not a notification

const can = (admin, key) => Boolean(admin.isMaster || (admin.permissions || []).includes(key));

const rupees = (paise) => `₹${(Number(paise || 0) / 100).toFixed(2)}`;

const namesOf = async (clientIds) => {
  const ids = [...new Set(clientIds.filter(Boolean).map(String))];
  if (!ids.length) return new Map();
  const rows = await Client.findAll({ where: { id: ids }, attributes: ['id', 'name'] });
  return new Map(rows.map((row) => [String(row.id), row.name]));
};

const inquiryItems = async () => {
  const rows = await Inquiry.findAll({ where: { status: INQUIRY_STATUS.NEW }, order: [['createdAt', 'DESC']], limit: MAX_ITEMS });
  return rows.map((row) => ({
    type: 'inquiry',
    uuid: row.uuid,
    title: `New inquiry from ${row.name || 'a visitor'}`,
    subtitle: row.schoolName || row.email || '',
    createdAt: row.createdAt,
    link: '/inquiries',
  }));
};

const billingItems = async () => {
  const since = new Date(Date.now() - FAILED_PAYMENT_LOOKBACK_DAYS * 86400000);
  const payments = await Payment.findAll({
    where: { status: PAYMENT_STATUS.FAILED, createdAt: { [Op.gte]: since } },
    order: [['createdAt', 'DESC']],
    limit: MAX_ITEMS,
  });
  const pastDue = await Subscription.findAll({
    where: { status: SUBSCRIPTION_STATUS.PAST_DUE },
    order: [['updatedAt', 'DESC']],
    limit: MAX_ITEMS,
  });

  const names = await namesOf([...payments.map((row) => row.clientId), ...pastDue.map((row) => row.clientId)]);
  const schoolOf = (clientId) => names.get(String(clientId)) || 'A school';

  return [
    ...payments.map((row) => ({
      type: 'payment_failed',
      uuid: row.uuid,
      title: `Payment failed: ${schoolOf(row.clientId)}`,
      subtitle: [rupees(row.amountPaise), row.failureReason].filter(Boolean).join(' · '),
      createdAt: row.createdAt,
      link: '/payments',
    })),
    ...pastDue.map((row) => ({
      type: 'subscription_past_due',
      uuid: row.uuid,
      title: `${schoolOf(row.clientId)} is past due`,
      subtitle: 'The renewal payment is overdue',
      createdAt: row.updatedAt,
      link: '/subscriptions',
    })),
  ];
};

const list = async (admin) => {
  const items = [];

  if (can(admin, 'inquiries.view') && (await safeSetting('notifications.show_new_inquiries', true)) !== false) {
    items.push(...(await inquiryItems()));
  }
  if (can(admin, 'billing.view') && (await safeSetting('notifications.show_failed_payments', true)) !== false) {
    items.push(...(await billingItems()));
  }

  items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const shown = items.slice(0, MAX_ITEMS);

  const me = await AdminUser.findByPk(admin.id, { attributes: ['id', 'lastSeenNotificationsAt'] });
  const lastSeen = me && me.lastSeenNotificationsAt ? new Date(me.lastSeenNotificationsAt) : null;
  const unreadCount = shown.filter((item) => !lastSeen || new Date(item.createdAt) > lastSeen).length;

  return { items: NotificationResource.collection(shown), unreadCount, lastSeenAt: lastSeen };
};

const markSeen = async (admin) => {
  const now = new Date();
  await AdminUser.update({ lastSeenNotificationsAt: now }, { where: { id: admin.id } });
  return { lastSeenAt: now };
};

module.exports = { list, markSeen };
