const { Sequelize } = require('sequelize');
const dbConfig = require('@config/database');
const appConfig = require('@config/app');
const logger = require('@app/Helpers/logger');

const db = dbConfig[appConfig.env];

// one shared Sequelize instance for the whole app (models import this)
const sequelize = new Sequelize(db.database, db.username, db.password, {
  host: db.host,
  port: db.port,
  dialect: db.dialect,
  logging: false,
  pool: { max: 10, min: 0, acquire: 30000, idle: 10000 },
});

// checks the connection at startup; stops the server with a clear message if it fails
const connect = async () => {
  logger.title('Connecting to database');
  try {
    await sequelize.authenticate();
    logger.ok(`Database connected  (${db.database} @ ${db.host}:${db.port}, user: ${db.username})`);
  } catch (err) {
    logger.error(`Database connection failed  (${db.database} @ ${db.host}:${db.port}): ${err.message}`);
    logger.dim('  Check that Postgres is running and DB_* values in .env are correct (run: npm run setup)');
    process.exit(1);
  }
};

module.exports = { sequelize, connect };
