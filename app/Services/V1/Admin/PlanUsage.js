const { Subscription } = require('@app/Models');
const { SUBSCRIPTION_STATUS } = require('@app/Helpers/constants');

// How many schools use a plan right now: subscriptions that are not finished (pending, active or past due).
// Every rule in PlanService (no deleting a plan in use, no shrinking limits or modules of a plan in use) calls this.
const IN_USE = [SUBSCRIPTION_STATUS.PENDING, SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.PAST_DUE];

const count = (plan) => Subscription.count({ where: { planId: plan.id, status: IN_USE } });

module.exports = { count };
