const fs = require('fs');
const path = require('path');

// every file in this folder is one rule, named after the file (required, email, min ...)
const rules = {};
for (const file of fs.readdirSync(__dirname)) {
  if (file === 'index.js' || !file.endsWith('.js')) continue;
  rules[path.basename(file, '.js')] = require(path.join(__dirname, file));
}

module.exports = rules;
