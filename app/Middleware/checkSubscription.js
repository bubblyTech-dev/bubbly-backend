const AppError = require('@app/Helpers/AppError');
const { USER_ROLE } = require('@app/Helpers/constants');
const SubscriptionAccess = require('@app/Services/V1/Common/SubscriptionAccess');

// The school must have a subscription that lets it in (Active, or Past due inside the grace period).
// Otherwise 402 SUBSCRIPTION_INACTIVE with a clear message. The server decides; hiding menus is not enough.
//
// The Principal can still reach the subscription and billing endpoints, so they can fix the payment.
// (/auth/me is outside this group, so every role can still load who they are.)
const PRINCIPAL_BILLING_PATHS = ['/subscription', '/billing'];

const isBillingPath = (path) => PRINCIPAL_BILLING_PATHS.some((base) => path === base || path.startsWith(`${base}/`));

module.exports = async (req, res, next) => {
  const access = await SubscriptionAccess.forClient(req.client.id);
  req.access = access;

  if (access.allowed) return next();
  if (req.user.role === USER_ROLE.PRINCIPAL && isBillingPath(req.path)) return next();

  throw new AppError(402, access.message, { code: 'SUBSCRIPTION_INACTIVE' });
};
