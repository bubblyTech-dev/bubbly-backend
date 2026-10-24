const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const appDir = path.join(__dirname, '..');

// every folder under app/ that holds code; order = load order
const folders = [
  'Helpers',
  'Rules',
  'Models',
  'Services',
  'Resources',
  'Requests',
  'Middleware',
  'Controllers',
  'Jobs',
  'Mail',
  'Providers',
];

const jsFiles = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return jsFiles(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });

// requires every .js file in app/<folder>, logs each one, stops on the first broken file
const autoload = () => {
  logger.title('Loading app files');
  let total = 0;

  for (const folder of folders) {
    const dir = path.join(appDir, folder);
    if (!fs.existsSync(dir)) {
      logger.warn(`${folder.padEnd(12)} folder missing`);
      continue;
    }

    const files = jsFiles(dir);
    for (const file of files) {
      const rel = path.relative(appDir, file);
      try {
        require(file);
        logger.ok(`${rel}`);
      } catch (err) {
        logger.error(`${rel}  ->  ${err.message}`);
        console.error(err.stack);
        process.exit(1);
      }
    }
    total += files.length;
    logger.dim(`  ${folder.padEnd(12)} ${files.length} file(s)`);
  }

  logger.info(`${total} app file(s) loaded`);
};

module.exports = autoload;
