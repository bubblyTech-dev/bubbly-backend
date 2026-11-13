const { Plan } = require('@app/Models');
const {
  CLIENT_STATUS,
  SUBSCRIPTION_STATUS,
  PAYMENT_STATUS,
  INVOICE_STATUS,
  INQUIRY_STATUS,
  INQUIRY_SOURCE,
  BILLING_SOURCE,
  BILLING_INTERVAL,
  PLAN_STATUS,
  ANNOUNCEMENT_TYPE,
  ANNOUNCEMENT_STATUS,
  ADMIN_STATUS,
  ADMIN_TYPE,
  WEBHOOK_EVENT_STATUS,
} = require('@app/Helpers/constants');

// Names for the integer codes, shared by analytics and reports so every page says the same words.
//
//   optionSets.label('subscriptionStatus', 2)          -> 'Active'
//   await optionSets.options('subscriptionStatus')     -> [{ value: 1, label: 'Pending' }, ...]
//   await optionSets.options('plans')                  -> [{ value: '<plan uuid>', label: 'Starter' }, ...]
//
// Add a set here when a new area needs one (do it in your own definition file if it is only yours).

const staticSets = {
  schoolStatus: {
    [CLIENT_STATUS.ACTIVE]: 'Active',
    [CLIENT_STATUS.SUSPENDED]: 'Suspended',
    [CLIENT_STATUS.ARCHIVED]: 'Archived',
  },
  subscriptionStatus: {
    [SUBSCRIPTION_STATUS.PENDING]: 'Pending',
    [SUBSCRIPTION_STATUS.ACTIVE]: 'Active',
    [SUBSCRIPTION_STATUS.PAST_DUE]: 'Past due',
    [SUBSCRIPTION_STATUS.CANCELLED]: 'Cancelled',
    [SUBSCRIPTION_STATUS.EXPIRED]: 'Expired',
    [SUBSCRIPTION_STATUS.SUSPENDED]: 'Suspended',
  },
  billingSource: {
    [BILLING_SOURCE.RAZORPAY]: 'Online (Razorpay)',
    [BILLING_SOURCE.OFFLINE]: 'Offline',
  },
  billingInterval: {
    [BILLING_INTERVAL.MONTHLY]: 'Monthly',
    [BILLING_INTERVAL.QUARTERLY]: 'Quarterly',
    [BILLING_INTERVAL.YEARLY]: 'Yearly',
  },
  paymentStatus: {
    [PAYMENT_STATUS.CREATED]: 'Created',
    [PAYMENT_STATUS.AUTHORIZED]: 'Authorized',
    [PAYMENT_STATUS.CAPTURED]: 'Captured',
    [PAYMENT_STATUS.FAILED]: 'Failed',
    [PAYMENT_STATUS.REFUNDED]: 'Refunded',
    [PAYMENT_STATUS.PARTIALLY_REFUNDED]: 'Partially refunded',
  },
  invoiceStatus: {
    [INVOICE_STATUS.DRAFT]: 'Draft',
    [INVOICE_STATUS.ISSUED]: 'Issued',
    [INVOICE_STATUS.PAID]: 'Paid',
    [INVOICE_STATUS.VOID]: 'Void',
  },
  inquiryStatus: {
    [INQUIRY_STATUS.NEW]: 'New',
    [INQUIRY_STATUS.IN_PROGRESS]: 'In progress',
    [INQUIRY_STATUS.RESOLVED]: 'Resolved',
    [INQUIRY_STATUS.SPAM]: 'Spam',
  },
  inquirySource: {
    [INQUIRY_SOURCE.CONTACT_FORM]: 'Contact form',
    [INQUIRY_SOURCE.DEMO_REQUEST]: 'Demo request',
    [INQUIRY_SOURCE.PRICING_PAGE]: 'Pricing page',
  },
  planStatus: {
    [PLAN_STATUS.DRAFT]: 'Draft',
    [PLAN_STATUS.PUBLISHED]: 'Published',
    [PLAN_STATUS.ARCHIVED]: 'Archived',
  },
  announcementType: {
    [ANNOUNCEMENT_TYPE.INFO]: 'Info',
    [ANNOUNCEMENT_TYPE.WARNING]: 'Warning',
    [ANNOUNCEMENT_TYPE.MAINTENANCE]: 'Maintenance',
  },
  announcementStatus: {
    [ANNOUNCEMENT_STATUS.DRAFT]: 'Draft',
    [ANNOUNCEMENT_STATUS.SCHEDULED]: 'Scheduled',
    [ANNOUNCEMENT_STATUS.PUBLISHED]: 'Published',
    [ANNOUNCEMENT_STATUS.EXPIRED]: 'Expired',
  },
  adminStatus: {
    [ADMIN_STATUS.ACTIVE]: 'Active',
    [ADMIN_STATUS.INACTIVE]: 'Inactive',
    [ADMIN_STATUS.LOCKED]: 'Locked',
  },
  adminType: {
    [ADMIN_TYPE.MASTER]: 'Master',
    [ADMIN_TYPE.STAFF]: 'Staff',
  },
  webhookStatus: {
    [WEBHOOK_EVENT_STATUS.RECEIVED]: 'Received',
    [WEBHOOK_EVENT_STATUS.PROCESSED]: 'Processed',
    [WEBHOOK_EVENT_STATUS.FAILED]: 'Failed',
    [WEBHOOK_EVENT_STATUS.IGNORED]: 'Ignored',
  },
};

const label = (setName, value, fallback = '-') => {
  const set = staticSets[setName];
  if (!set) return fallback;
  return set[value] ?? fallback;
};

const staticOptions = (setName) =>
  Object.entries(staticSets[setName]).map(([value, text]) => ({ value: Number(value), label: text }));

// plans are the only dynamic set: the option value is the public uuid
const planOptions = async () => {
  const plans = await Plan.findAll({ attributes: ['uuid', 'name'], order: [['name', 'ASC']] });
  return plans.map((plan) => ({ value: plan.uuid, label: plan.name }));
};

const options = async (setName) => {
  if (setName === 'plans') return planOptions();
  if (!staticSets[setName]) throw new Error(`Unknown option set "${setName}".`);
  return staticOptions(setName);
};

const has = (setName) => setName === 'plans' || Boolean(staticSets[setName]);

module.exports = { label, options, has, staticSets };
