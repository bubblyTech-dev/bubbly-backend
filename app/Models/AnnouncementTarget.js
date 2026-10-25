const { DataTypes } = require('sequelize');
const defineModel = require('./BaseModel');

// One school or plan an announcement is aimed at. target_id has no database foreign key on purpose.
module.exports = defineModel(
  'AnnouncementTarget',
  'announcement_targets',
  {
    announcementId: { type: DataTypes.BIGINT, allowNull: false },
    targetKind: DataTypes.SMALLINT, // 1: School, 2: Plan
    targetId: DataTypes.BIGINT,
  },
  { appendOnly: true },
);
