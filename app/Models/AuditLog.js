const { DataTypes } = require('sequelize');
const defineModel = require('./BaseModel');

// Who did what to which record. Append-only: rows are never changed or deleted.
module.exports = defineModel(
  'AuditLog',
  'audit_logs',
  {
    actorType: DataTypes.SMALLINT, // 1: Admin, 2: School user, 3: System
    actorId: DataTypes.BIGINT,
    actorName: DataTypes.STRING(150),
    actorIsMaster: { type: DataTypes.SMALLINT, defaultValue: 0 }, // 1: Yes (hidden from other admins), 0: No
    clientId: DataTypes.BIGINT,
    action: DataTypes.STRING(100),
    entityType: DataTypes.STRING(60),
    entityUuid: DataTypes.UUID,
    description: DataTypes.STRING(300),
    beforeData: DataTypes.JSONB,
    afterData: DataTypes.JSONB,
    ipAddress: DataTypes.STRING(64),
    userAgent: DataTypes.STRING(400),
  },
  { appendOnly: true },
);
