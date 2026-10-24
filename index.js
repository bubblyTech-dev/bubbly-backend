require('module-alias/register');

const config = require('@config/app');
const logger = require('@app/Helpers/logger');

logger.title(`${config.name} API  |  env: ${config.env}`);

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

// load and log every file under app/
require('@app/Helpers/autoload')();

const { connect: connectDatabase } = require('@app/Helpers/database');

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());

logger.title('Loading routes');
app.use('/api', require('@routes'));

app.use((req, res) => {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
});

app.use((err, req, res, next) => {
  logger.error(err.stack || err.message);
  res.status(err.status || 500).json({ message: err.message || 'Server error' });
});

const start = async () => {
  await connectDatabase();

  app.listen(config.port, () => {
    logger.title('Server ready');
    logger.ok(`http://localhost:${config.port}/api/health`);
  });
};

start();
