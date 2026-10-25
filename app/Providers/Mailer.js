const axios = require('axios');
const logger = require('@app/Helpers/logger');

// Sends transactional email through Loops (https://loops.so). The email design lives in Loops, not here.
// Without LOOPS_API_KEY (local development) the message is printed in the terminal instead, so flows can still be tested.
//
//   await Mailer.sendTransactional({ to, transactionalId: process.env.LOOPS_TX_PASSWORD_RESET, data: { resetUrl } })
//
// The transactional ids move to platform_settings once that table exists.
const LOOPS_URL = 'https://app.loops.so/api/v1/transactional';

const sendTransactional = async ({ to, transactionalId, data = {} }) => {
  const apiKey = process.env.LOOPS_API_KEY;

  if (!apiKey || !transactionalId) {
    logger.warn(`[mail not sent: Loops is not configured] to ${to}`);
    Object.entries(data).forEach(([key, value]) => logger.dim(`    ${key}: ${value}`));
    return { sent: false };
  }

  try {
    await axios.post(LOOPS_URL, { email: to, transactionalId, dataVariables: data }, { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 10000 });
    return { sent: true };
  } catch (err) {
    // never fail the request because an email could not be sent
    logger.error(`Loops email failed: ${err.response?.status || ''} ${err.message}`);
    return { sent: false };
  }
};

module.exports = { sendTransactional };
