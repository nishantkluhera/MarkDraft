const { join } = require('path');

// Keep Puppeteer's Chrome download inside the project. The default
// (~/.cache/puppeteer) lives outside the project dir, and on hosts like Render
// that folder is discarded between build and runtime, so Chrome goes missing.
module.exports = {
  cacheDirectory: join(__dirname, '.cache', 'puppeteer')
};
