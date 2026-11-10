require('module-alias/register');

const config = require('@config/app');
const logger = require('@app/Helpers/logger');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const auth = require('@config/auth');
const Files = require('@app/Helpers/files');
const { connect: connectDatabase } = require('@app/Helpers/database');
const { notFound, errorHandler } = require('@app/Middleware/errorHandler');

const app = express();
if (auth.trustProxy) app.set('trust proxy', 1); // behind Nginx on the server, so req.ip is the real visitor
app.use(helmet());
app.use(
  cors({
    origin: auth.corsOrigins, // only our own apps, never "*" (cookies are sent, so credentials must be allowed)
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  }),
);
// The payment webhook needs the body exactly as received (its signature covers the raw bytes), so it is read as a
// Buffer here, BEFORE express.json() would parse it. Every other route gets parsed JSON.
app.use('/api/webhooks/payment', express.raw({ type: '*/*', limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));

app.use('/api', require('@routes'));

app.use(notFound);
app.use(errorHandler);

const start = async () => {
  await connectDatabase();

  // uploads nobody saved are deleted after a day
  Files.cleanTemp().catch(() => {});
  setInterval(() => Files.cleanTemp().catch(() => {}), 3600 * 1000).unref();

  app.listen(config.port, () => {
    logger.title('Server ready');
    logger.ok(`http://localhost:${config.port}/api/health`);
    logger.dim(`  CORS allows: ${auth.corsOrigins.join(', ')}`);
  });
};

start();
