const { DataTypes } = require('sequelize');
const defineModel = require('./BaseModel');

// Internal notes staff write on an inquiry. Never shown to the visitor.
module.exports = defineModel(
  'InquiryNote',
  'inquiry_notes',
  {
    inquiryId: { type: DataTypes.BIGINT, allowNull: false },
    note: DataTypes.TEXT,
    createdBy: DataTypes.BIGINT,
  },
  { appendOnly: true },
);
