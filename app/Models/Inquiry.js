const { DataTypes } = require('sequelize');
const defineModel = require('./BaseModel');

// A message sent from the public website (contact form, demo request, pricing page).
module.exports = defineModel(
  'Inquiry',
  'inquiries',
  {
    name: DataTypes.STRING(150),
    email: DataTypes.STRING(190),
    phone: DataTypes.STRING(30),
    schoolName: DataTypes.STRING(190),
    message: DataTypes.TEXT,
    source: { type: DataTypes.SMALLINT, defaultValue: 1 }, // 1: Contact form, 2: Demo request, 3: Pricing page
    status: { type: DataTypes.SMALLINT, defaultValue: 1 }, // 1: New, 2: In progress, 3: Resolved, 4: Spam
    assignedTo: DataTypes.BIGINT,
    resolvedAt: DataTypes.DATE,
    ipAddress: DataTypes.STRING(64),
    userAgent: DataTypes.STRING(400),
  },
  { paranoid: true },
);
