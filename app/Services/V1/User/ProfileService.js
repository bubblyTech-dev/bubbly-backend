const Audit = require('@app/Helpers/audit');
const { sequelize } = require('@app/Helpers/database');
const { User } = require('@app/Models');
const UserResource = require('@app/Resources/V1/User/UserResource');

// The signed-in person's own details. The email is the login, so it is not changed here
// (the Principal changes a teacher's or parent's email from their record).

const show = async (ctx) => UserResource.make(await User.findByPk(ctx.user.id), { permissions: ctx.user.permissions });

const update = async (ctx, data) =>
  sequelize.transaction(async (transaction) => {
    const user = await User.findByPk(ctx.user.id, { transaction });
    const before = Audit.pick(user, ['name', 'phone']);
    const changes = {};
    if (data.name !== undefined && data.name) changes.name = data.name;
    if (data.phone !== undefined) changes.phone = data.phone || null;

    if (Object.keys(changes).length) {
      await user.update(changes, { transaction });
      await Audit.log(
        ctx,
        'profile.updated',
        { entityType: 'user', entityUuid: user.uuid, description: 'Updated own profile', before, after: Audit.pick(user, ['name', 'phone']) },
        { transaction },
      );
    }
    return UserResource.make(user, { permissions: ctx.user.permissions });
  });

module.exports = { show, update };
