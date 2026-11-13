const { DataTypes } = require('sequelize');
const defineModel = require('./BaseModel');

// A school. This is the tenant: every school-owned table elsewhere has a client_id that points here.
module.exports = defineModel(
  'Client',
  'clients',
  {
    name: DataTypes.STRING(150),
    slug: DataTypes.STRING(100),
    status: { type: DataTypes.SMALLINT, defaultValue: 1 }, // 1: Active, 2: Suspended, 3: Archived
    contactName: DataTypes.STRING(150),
    contactEmail: DataTypes.STRING(190),
    contactPhone: DataTypes.STRING(30),
    addressLine1: DataTypes.STRING(200),
    addressLine2: DataTypes.STRING(200),
    city: DataTypes.STRING(100),
    state: DataTypes.STRING(100),
    postalCode: DataTypes.STRING(20),
    country: DataTypes.STRING(100),
    gstNumber: DataTypes.STRING(20),
    razorpayCustomerId: DataTypes.STRING(60), // this school as a Razorpay customer
    logo: DataTypes.STRING(120), // file name only; the folder comes from config/files.js
    timezone: DataTypes.STRING(60),
    createdBy: DataTypes.BIGINT,
    updatedBy: DataTypes.BIGINT,
  },
  { paranoid: true },
);
