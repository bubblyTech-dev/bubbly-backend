const { Op, Sequelize } = require('sequelize');
const Settings = require('@app/Helpers/settings');
const { paginationParams } = require('@app/Helpers/pagination');
const { SUBSCRIPTION_STATUS } = require('@app/Helpers/constants');
const { Client, Plan, Subscription } = require('@app/Models');
const RenewalResource = require('@app/Resources/V1/Admin/RenewalResource');

// The Renewals page: which schools need attention, in four lists. Every number of days comes from Settings
// (renewals.due_soon_days and policy.grace_days). Both Razorpay and offline subscriptions are included, because the
// lists use only the status and the dates.
//
//   due_soon        Active, and the next charge (or the end of the period) is within the due-soon window or already passed
//   payment_failed  Past due
//   in_grace        Past due and still inside the grace period (counted from when it became Past due)
//   suspended       Suspended
const S = SUBSCRIPTION_STATUS;
const DAY = 86400000;
const TABS = ['due_soon', 'payment_failed', 'in_grace', 'suspended'];

const withRelations = [
  { model: Client, as: 'client', attributes: ['id', 'uuid', 'name'] },
  { model: Plan, as: 'plan', attributes: ['id', 'uuid', 'name'] },
];

const escapeLike = (text) => text.replace(/[\\%_]/g, '\\$&');

// when the subscription became Past due (the stored time, or its last change for older rows)
const pastDueAt = Sequelize.fn('COALESCE', Sequelize.col('Subscription.past_due_since'), Sequelize.col('Subscription.updated_at'));

// the key date of a Due soon row: the next charge, or the end of the period when no charge is planned
const dueDate = Sequelize.fn('COALESCE', Sequelize.col('Subscription.next_charge_at'), Sequelize.col('Subscription.current_period_end'));

const rules = async () => ({
  now: new Date(),
  dueSoonDays: Number(await Settings.get('renewals.due_soon_days')),
  graceDays: Number(await Settings.get('policy.grace_days')),
});

// the conditions of one tab (without the search)
const tabWhere = (tab, { now, dueSoonDays, graceDays }) => {
  switch (tab) {
    case 'due_soon':
      return {
        [Op.and]: [
          { status: S.ACTIVE },
          Sequelize.where(dueDate, { [Op.lte]: new Date(now.getTime() + dueSoonDays * DAY) }),
        ],
      };
    case 'payment_failed':
      return { status: S.PAST_DUE };
    case 'in_grace':
      return {
        [Op.and]: [
          { status: S.PAST_DUE },
          Sequelize.where(pastDueAt, { [Op.gte]: new Date(now.getTime() - graceDays * DAY) }),
        ],
      };
    default:
      return { status: S.SUSPENDED };
  }
};

const orderOf = (tab) => {
  if (tab === 'due_soon') return [[dueDate, 'ASC'], ['id', 'ASC']];
  if (tab === 'in_grace') return [[pastDueAt, 'ASC'], ['id', 'ASC']]; // the grace that ends first, first
  return [[pastDueAt, 'DESC'], ['id', 'DESC']]; // the most recent problem first
};

const searchWhere = (search) => {
  if (!search) return null;
  const pattern = `%${escapeLike(search)}%`;
  return {
    [Op.or]: [
      { '$client.name$': { [Op.iLike]: pattern } },
      { '$plan.name$': { [Op.iLike]: pattern } },
      { razorpaySubscriptionId: { [Op.iLike]: pattern } },
    ],
  };
};

const list = async (query) => {
  const tab = TABS.includes(query.tab) ? query.tab : 'due_soon';
  const context = await rules();
  const { page, perPage, limit, offset } = paginationParams(query);

  const where = { [Op.and]: [tabWhere(tab, context)] };
  const search = searchWhere(query.search);
  if (search) where[Op.and].push(search);

  const { rows, count } = await Subscription.findAndCountAll({
    where,
    include: withRelations,
    order: orderOf(tab),
    limit,
    offset,
  });

  const result = RenewalResource.paginate({ rows, count, page, perPage }, { tab, now: context.now, graceDays: context.graceDays });
  return { ...result, meta: { ...result.meta, tab, dueSoonDays: context.dueSoonDays, graceDays: context.graceDays } };
};

// the number on each tab, and the money that is due soon
const counts = async () => {
  const context = await rules();
  const output = {};

  for (const tab of TABS) {
    output[tab] = await Subscription.count({ where: tabWhere(tab, context) });
  }

  const dueSum = await Subscription.sum('amountPaise', { where: tabWhere('due_soon', context) });

  return {
    counts: output,
    summary: {
      dueSoonAmountPaise: Number(dueSum || 0),
      currency: 'INR',
      dueSoonDays: context.dueSoonDays,
      graceDays: context.graceDays,
    },
  };
};

module.exports = { list, counts };
