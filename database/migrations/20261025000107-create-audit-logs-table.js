const { DataTypes, Sequelize } = require('sequelize');
const { addIndexes } = require('../helpers');

// Who did what, when and to which record. Append-only and without foreign keys on purpose:
// the log must survive even if the referenced row is removed later.
module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('audit_logs', {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
        comment: 'Internal key, used for joins only',
      },
      uuid: {
        type: DataTypes.UUID,
        allowNull: false,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        comment: 'Public id, the only id the API uses',
      },
      actor_type: {
        type: DataTypes.SMALLINT,
        comment: '1: Admin, 2: School user, 3: System',
      },
      actor_id: {
        type: DataTypes.BIGINT,
      },
      actor_name: {
        type: DataTypes.STRING(150),
        comment: 'Name at the time of the action',
      },
      actor_is_master: {
        type: DataTypes.SMALLINT,
        defaultValue: 0,
        comment: '1: Yes (hidden from other admins), 0: No',
      },
      client_id: {
        type: DataTypes.BIGINT,
        comment: 'The school involved, if any',
      },
      action: {
        type: DataTypes.STRING(100),
        comment: 'For example admin_user.created',
      },
      entity_type: {
        type: DataTypes.STRING(60),
      },
      entity_uuid: {
        type: DataTypes.UUID,
      },
      description: {
        type: DataTypes.STRING(300),
        comment: 'Short human readable summary',
      },
      before_data: {
        type: DataTypes.JSONB,
        comment: 'Values before the change',
      },
      after_data: {
        type: DataTypes.JSONB,
        comment: 'Values after the change',
      },
      ip_address: {
        type: DataTypes.STRING(64),
      },
      user_agent: {
        type: DataTypes.STRING(400),
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
    });

    await addIndexes(queryInterface, 'audit_logs', [
      'uuid',
      'action',
      'created_at',
      ['client_id', 'created_at'],
      ['entity_type', 'entity_uuid'],
      ['actor_type', 'actor_id', 'created_at'],
    ]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('audit_logs');
  },
};
