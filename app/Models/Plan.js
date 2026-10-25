const { DataTypes } = require('sequelize');
const defineModel = require('./BaseModel');

// A subscription plan sold to schools. Money is stored in paise.
module.exports = defineModel(
  'Plan',
  'plans',
  {
    name: DataTypes.STRING(150),
    slug: DataTypes.STRING(150),
    description: DataTypes.STRING(1000),
    pricePaise: { type: DataTypes.BIGINT, defaultValue: 0 },
    currency: { type: DataTypes.STRING(3), defaultValue: 'INR' },
    billingInterval: { type: DataTypes.SMALLINT, defaultValue: 1 }, // 1: Monthly, 2: Quarterly, 3: Yearly
    taxInclusive: { type: DataTypes.SMALLINT, defaultValue: 0 }, // 1: Yes, 0: No
    status: { type: DataTypes.SMALLINT, defaultValue: 1 }, // 1: Draft, 2: Published, 3: Archived
    sortOrder: { type: DataTypes.INTEGER, defaultValue: 0 },
    isFeatured: { type: DataTypes.SMALLINT, defaultValue: 0 }, // 1: Yes, 0: No
    version: { type: DataTypes.INTEGER, defaultValue: 1 },
    publishedAt: DataTypes.DATE,
    archivedAt: DataTypes.DATE,
    createdBy: DataTypes.BIGINT,
    updatedBy: DataTypes.BIGINT,
  },
  { paranoid: true },
);
