const { Client } = require('pg');
const db = require('../config/database')[process.env.NODE_ENV || 'development'];
const logger = require('../app/Helpers/logger');

// creates the database only if it does not exist yet (safe to run any number of times)
(async () => {
  const client = new Client({
    host: db.host,
    port: db.port,
    user: db.username,
    password: db.password,
    database: 'postgres',
  });

  try {
    await client.connect();
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [db.database]);

    if (rowCount) {
      logger.info(`Database "${db.database}" already exists, skipping`);
    } else {
      await client.query(`CREATE DATABASE "${db.database.replace(/"/g, '""')}"`);
      logger.ok(`Database "${db.database}" created`);
    }
  } catch (err) {
    logger.error(`Could not create database: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
})();
