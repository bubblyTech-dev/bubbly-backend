const c = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

const logger = {
  info: (msg) => console.log(`${c.cyan}ℹ${c.reset} ${msg}`),
  ok: (msg) => console.log(`${c.green}✔${c.reset} ${msg}`),
  warn: (msg) => console.log(`${c.yellow}⚠${c.reset} ${msg}`),
  error: (msg) => console.error(`${c.red}✖${c.reset} ${msg}`),
  dim: (msg) => console.log(`${c.dim}${msg}${c.reset}`),
  title: (msg) => console.log(`\n${c.bold}${msg}${c.reset}`),
};

module.exports = logger;
