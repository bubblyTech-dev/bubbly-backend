// How many schools use a plan right now. Subscriptions are built in a later module, so nothing can use a plan yet and
// this returns 0. When subscriptions exist, change only this function to count the active ones; every rule in
// PlanService (no deleting a plan in use, no shrinking limits or modules of a plan in use) already calls it.
const count = async () => 0;

module.exports = { count };
