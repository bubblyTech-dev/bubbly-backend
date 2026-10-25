const { DataTypes } = require('sequelize');
const defineModel = require('./BaseModel');

// A notice from Bubbly staff to schools. Scheduled, Published and Expired are worked out from the dates (see the resource).
module.exports = defineModel(
  'Announcement',
  'announcements',
  {
    title: DataTypes.STRING(200),
    body: DataTypes.TEXT,
    type: { type: DataTypes.SMALLINT, defaultValue: 1 }, // 1: Info, 2: Warning, 3: Maintenance
    status: { type: DataTypes.SMALLINT, defaultValue: 1 }, // 1: Draft, 2: Scheduled, 3: Published, 4: Expired
    targetType: { type: DataTypes.SMALLINT, defaultValue: 1 }, // 1: All schools, 2: Selected schools, 3: Selected plans
    startsAt: DataTypes.DATE,
    endsAt: DataTypes.DATE,
    publishedAt: DataTypes.DATE,
    createdBy: DataTypes.BIGINT,
    updatedBy: DataTypes.BIGINT,
  },
  { paranoid: true },
);
