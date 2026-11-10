const Audit = require('@app/Helpers/audit');
const { sequelize } = require('@app/Helpers/database');
const { CLIENT_STATUS } = require('@app/Helpers/constants');
const { Client } = require('@app/Models');
const PrincipalProvisioner = require('./PrincipalProvisioner');

// What happens when a school's first payment is confirmed (called by the webhook handlers, in their transaction).
// It is idempotent: the webhook can deliver the same event twice and nothing is done twice.
//
//   1. the school is made Active (a school suspended or never activated becomes usable)
//   2. its Principal login is created and the welcome email with the set-password link is sent
//
// A problem in step 2 (for example the mail provider) is written to the audit log and never fails the webhook:
// the payment is real, so the subscription must stay Active. Staff can fix the Principal from the Admin app.

const onSubscriptionActivated = async (subscription, client, { transaction }) => {
  const school = client || (await Client.findByPk(subscription.clientId, { transaction }));
  if (!school) return;

  if (Number(school.status) === CLIENT_STATUS.SUSPENDED) {
    await school.update({ status: CLIENT_STATUS.ACTIVE }, { transaction });
    await Audit.log(
      {},
      'school.activated_by_payment',
      { entityType: 'school', entityUuid: school.uuid, clientId: school.id, description: `${school.name} was reactivated by its payment` },
      { transaction },
    );
  }

  try {
    // a nested transaction is a savepoint: a failure here is undone without aborting the webhook's own transaction
    await sequelize.transaction({ transaction }, (inner) => PrincipalProvisioner.provisionPrincipal(school, { transaction: inner }));
  } catch (error) {
    await Audit.log(
      {},
      'school.principal_provision_failed',
      {
        entityType: 'school',
        entityUuid: school.uuid,
        clientId: school.id,
        description: `The Principal login could not be created: ${String(error.message).slice(0, 200)}`,
      },
      { transaction },
    );
  }
};

module.exports = { onSubscriptionActivated };
