require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const morgan = require('morgan');
const winston = require('winston');
const { body, validationResult } = require('express-validator');
const MarkdownIt = require('markdown-it');
const hljs = require('highlight.js');
const sanitizeHtml = require('sanitize-html');
const { version } = require('./package.json');
const htmlToDocx = require('html-to-docx');

// puppeteer is ESM-only, so load it lazily with a dynamic import. Keeps this
// file CommonJS and avoids loading Chromium until the first PDF request.
let puppeteerPromise;
function getPuppeteer() {
  if (!puppeteerPromise) {
    puppeteerPromise = import('puppeteer').then((mod) => mod.default || mod);
  }
  return puppeteerPromise;
}

// winston writes to logs/, so make sure it's there first
const LOG_DIR = path.join(__dirname, 'logs');
if (!fsSync.existsSync(LOG_DIR)) {
  fsSync.mkdirSync(LOG_DIR, { recursive: true });
}

// Configuration
const config = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  maxRequestSize: process.env.MAX_REQUEST_SIZE || '10mb',
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    // higher cap since static files + the live preview hit this a lot
    max: parseInt(process.env.RATE_LIMIT_MAX) || 600,
    // conversions are heavy, keep them limited
    conversionMax: parseInt(process.env.CONVERSION_RATE_LIMIT_MAX) || 10
  },
  puppeteerExecutablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
};

// Simple logging setup
const logger = winston.createLogger({
  level: config.nodeEnv === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    // rotate so the log files don't grow without bound
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'error.log'),
      level: 'error',
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5,
      tailable: true
    }),
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'combined.log'),
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5,
      tailable: true
    })
  ]
});

// also log to stdout, which is what most hosts capture
logger.add(new winston.transports.Console({
  format: config.nodeEnv === 'production' ? winston.format.json() : winston.format.simple()
}));

const app = express();

// Trust proxy for accurate IP addresses
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ['\'self\''],
      // no third-party origins; fonts and icons are served locally
      styleSrc: ['\'self\'', '\'unsafe-inline\''],
      fontSrc: ['\'self\''],
      scriptSrc: ['\'self\''],
      // allow remote images so pasted image URLs render in the preview
      imgSrc: ['\'self\'', 'data:', 'https:', 'http:'],
      connectSrc: ['\'self\'']
    }
  }
}));

// allow the configured frontend + onrender domains in prod. filter(Boolean)
// drops FRONTEND_URL when it's unset so cors doesn't get `undefined`.
const allowedOrigins = [process.env.FRONTEND_URL, /\.onrender\.com$/].filter(Boolean);

app.use(cors({
  origin: config.nodeEnv === 'production' ? allowedOrigins : true,
  credentials: true,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rate limiting
const generalLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  message: { error: 'Too many requests from this IP, please try again later.' }
});

const conversionLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.conversionMax,
  message: { error: 'Too many conversion requests from this IP, please try again later.' }
});

app.use(generalLimiter);
app.use(compression());
// log format without IP/user-agent so we don't store PII
app.use(morgan(':method :url :status :res[content-length] - :response-time ms', {
  stream: { write: message => logger.info(message.trim()) }
}));
app.use(express.json({ limit: config.maxRequestSize }));
app.use(express.static(path.join(__dirname, 'public')));

// markdown-it with highlight.js for fenced code. Highlighting runs here so the
// preview, PDF and Word output all use the same markup.
const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: true,
  highlight(code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        const { value } = hljs.highlight(code, { language: lang, ignoreIllegals: true });
        return `<pre class="hljs"><code class="hljs language-${lang}">${value}</code></pre>`;
      } catch (_) { /* fall through to auto-detect */ }
    }
    try {
      const { value } = hljs.highlightAuto(code);
      return `<pre class="hljs"><code class="hljs">${value}</code></pre>`;
    } catch (_) {
      return `<pre class="hljs"><code class="hljs">${md.utils.escapeHtml(code)}</code></pre>`;
    }
  }
});

// keep the formatting markdown produces, drop anything that could run script
const sanitizeOptions = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat([
    'img', 'h1', 'h2', 'del', 'ins', 'sup', 'sub', 'hr', 'figure', 'figcaption'
  ]),
  allowedAttributes: {
    '*': ['align', 'class', 'id', 'title'],
    a: ['href', 'name', 'target', 'rel'],
    img: ['src', 'alt', 'width', 'height'],
    td: ['colspan', 'rowspan'],
    th: ['colspan', 'rowspan']
  },
  // safe url schemes only (blocks javascript:/vbscript:)
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: { img: ['http', 'https', 'data'] },
  allowProtocolRelative: false
};

// one render path for preview, docx and pdf so they all stay in sync
function renderMarkdownToSafeHtml(markdown) {
  return sanitizeHtml(md.render(markdown), sanitizeOptions);
}

// --- headless browser ---
// reuse one Chromium across requests instead of launching per PDF. saves a lot
// of memory and skips the ~1-2s startup each time.
let browserInstance = null;
let browserLaunch = null;

async function getBrowser() {
  if (browserInstance && browserInstance.connected) return browserInstance;
  if (!browserLaunch) {
    browserLaunch = getPuppeteer()
      .then((puppeteer) => puppeteer.launch({
        headless: true,
        // use a system Chromium when given one (Docker)
        executablePath: config.puppeteerExecutablePath,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      }))
      .then((b) => {
        browserInstance = b;
        browserLaunch = null;
        // if it crashes, clear the ref so the next request relaunches
        b.on('disconnected', () => { browserInstance = null; });
        return b;
      })
      .catch((err) => { browserLaunch = null; throw err; });
  }
  return browserLaunch;
}

async function closeBrowser() {
  const b = browserInstance;
  browserInstance = null;
  if (b) {
    try { await b.close(); } catch (_) { /* already gone */ }
  }
}

// limit concurrent PDF renders so a burst can't exhaust memory. extras queue,
// and a full queue returns 503 rather than piling up.
const PDF_CONCURRENCY = parseInt(process.env.PDF_CONCURRENCY) || 2;
const PDF_MAX_QUEUE = parseInt(process.env.PDF_MAX_QUEUE) || 20;
let activePdf = 0;
const pdfWaiters = [];

function acquirePdfSlot() {
  if (activePdf < PDF_CONCURRENCY) {
    activePdf++;
    return Promise.resolve(true);
  }
  if (pdfWaiters.length >= PDF_MAX_QUEUE) {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => pdfWaiters.push(resolve));
}

function releasePdfSlot() {
  const next = pdfWaiters.shift();
  if (next) {
    next(true); // pass the slot to the next in line
  } else {
    activePdf--;
  }
}

// Input validation
const validateMarkdownInput = [
  body('markdown')
    .trim()
    .isLength({ min: 1, max: 1000000 })
    .withMessage('Markdown content is required and must be less than 1MB'),
  body('orientation')
    .optional()
    .isIn(['portrait', 'landscape'])
    .withMessage('Orientation must be either portrait or landscape')
];

// Preview accepts empty input (renders to an empty document) but still caps size.
const validatePreviewInput = [
  body('markdown')
    .optional({ nullable: true })
    .isLength({ max: 1000000 })
    .withMessage('Markdown content must be less than 1MB')
];

function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // log field + message only, not the value (that would leak document content)
    const safeErrors = errors.array().map(e => ({ field: e.path, message: e.msg }));
    logger.warn('Validation failed', { errors: safeErrors });
    return res.status(400).json({
      error: 'Invalid input parameters',
      details: safeErrors
    });
  }
  next();
}

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version
  });
});

// DOCX conversion
app.post('/convert/docx', conversionLimiter, validateMarkdownInput, handleValidationErrors, async (req, res) => {
  try {
    const htmlContent = renderMarkdownToSafeHtml(req.body.markdown);
    const docxTemplate = await fs.readFile(path.join(__dirname, 'templates', 'docx-template.html'), 'utf8');
    const styledHtml = docxTemplate.replace('{{markdownContent}}', htmlContent);
    const docxBuffer = await htmlToDocx(styledHtml, null, {
      table: { row: { cantSplit: true } },
      footer: false,
      header: false
    });

    res.setHeader('Content-Disposition', 'attachment; filename="MarkDraft_converted.docx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.send(docxBuffer);

    logger.info('DOCX conversion completed', { size: docxBuffer.length });
  } catch (error) {
    logger.error('DOCX conversion failed', { error: error.message });
    res.status(500).json({ error: 'Failed to create Word document' });
  }
});

// PDF conversion
app.post('/convert/pdf', conversionLimiter, validateMarkdownInput, handleValidationErrors, async (req, res) => {
  const gotSlot = await acquirePdfSlot();
  if (!gotSlot) {
    return res.status(503).json({ error: 'Server is busy generating documents. Please try again in a moment.' });
  }

  let page;
  try {
    const { markdown: markdownText, orientation = 'portrait' } = req.body;
    const htmlContent = renderMarkdownToSafeHtml(markdownText);
    const pdfTemplate = await fs.readFile(path.join(__dirname, 'templates', 'pdf-template.html'), 'utf8');
    const styledHtml = pdfTemplate.replace('{{markdownContent}}', htmlContent);

    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 800 });
    await page.setContent(styledHtml, { waitUntil: 'networkidle0', timeout: 30000 });

    // page.pdf() returns a Uint8Array in puppeteer 24+; wrap in Buffer or
    // express will JSON-encode it instead of sending raw bytes
    const pdfBuffer = Buffer.from(await page.pdf({
      printBackground: true,
      margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' },
      landscape: orientation === 'landscape',
      preferCSSPageSize: false,
      timeout: 60000
    }));

    const filename = `MarkDraft_${orientation}.pdf`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/pdf');
    res.send(pdfBuffer);

    logger.info('PDF conversion completed', { size: pdfBuffer.length, orientation });
  } catch (error) {
    logger.error('PDF conversion failed', { error: error.message });

    let errorMessage = 'Failed to generate PDF document';
    if (error.message && error.message.includes('timeout')) {
      errorMessage = 'PDF generation timed out. The document might be too complex or large.';
    }

    res.status(500).json({ error: errorMessage });
  } finally {
    // close the page (keep the shared browser) and free the slot
    if (page) {
      try {
        await page.close();
      } catch (closeError) {
        logger.error('Error closing page', { error: closeError.message });
      }
    }
    releasePdfSlot();
  }
});

// live preview: same render pipeline as the converters, so it matches the output
app.post('/preview', validatePreviewInput, handleValidationErrors, (req, res) => {
  try {
    const html = renderMarkdownToSafeHtml(req.body.markdown || '');
    res.json({ html });
  } catch (error) {
    logger.error('Preview rendering failed', { error: error.message });
    res.status(500).json({ error: 'Failed to render preview' });
  }
});

// Serve main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// honor an upstream status (body-parser sets 400 on bad JSON), else 500
app.use((err, req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  logger.error('Unhandled error', { error: err.message, status, url: req.url, method: req.method });
  const message = status === 400 ? 'Invalid request payload' : 'An unexpected server error occurred';
  res.status(status).json({ error: message });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found', path: req.path });
});

// graceful shutdown: close the shared browser
async function shutdown(signal) {
  logger.info(`${signal} received, shutting down gracefully`);
  await closeBrowser();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// only listen when run directly; the tests import the app via supertest
if (require.main === module) {
  const server = app.listen(config.port, () => {
    logger.info(`MarkDraft server running at http://localhost:${config.port}`, {
      environment: config.nodeEnv,
      port: config.port
    });
  });

  server.on('error', (error) => {
    logger.error('Server error', { error: error.message });
  });
}

module.exports = app;
