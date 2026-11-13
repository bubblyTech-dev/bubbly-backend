const { AppModule, Plan, PlanFeature, PlanLimit } = require('@app/Models');
const { PLAN_STATUS } = require('@app/Helpers/constants');
const PublicPlanResource = require('@app/Resources/V1/Common/PublicPlanResource');

// published plans for the public pricing page
const listPublished = async () => {
  const plans = await Plan.findAll({
    where: { status: PLAN_STATUS.PUBLISHED },
    include: [
      { model: PlanLimit, as: 'limits' },
      { model: PlanFeature, as: 'features', include: [{ model: AppModule, as: 'module', attributes: ['moduleKey'] }] },
    ],
    order: [['sortOrder', 'ASC'], ['id', 'ASC']],
  });

  return PublicPlanResource.collection(plans);
};

module.exports = { listPublished };
