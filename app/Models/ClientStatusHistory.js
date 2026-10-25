const { DataTypes } = require('sequelize');
const defineModel = require('./BaseModel');

// Every status change of a school with its reason. Append-only.
module.exports = defineModel(
  'ClientStatusHistory',
  'client_status_history',
  {
    clientId: { type: DataTypes.BIGINT, allowNull: false },
    fromStatus: DataTypes.SMALLINT, // 1: Active, 2: Suspended, 3: Archived
    toStatus: DataTypes.SMALLINT,
    reason: DataTypes.STRING(500),
    changedBy: DataTypes.BIGINT,
  },
  { appendOnly: true },
);
