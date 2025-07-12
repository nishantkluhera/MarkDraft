require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const morgan = require('morgan');
const winston = require('winston');
const { body, validationResult } = require('express-validator');
const MarkdownIt = require('markdown-it');
const htmlToDocx = require('html-to-docx');
const puppeteer = require('puppeteer');

// Configuration
const config = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  maxRequestSize: process.env.MAX_REQUEST_SIZE || '10mb',
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
    conversionMax: parseInt(process.env.CONVERSION_RATE_LIMIT_MAX) || 10
  }
};

// Simple logging setup
const logger = winston.createLogger({
  level: config.nodeEnv === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});

if (config.nodeEnv !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

const app = express();

// Trust proxy for accurate IP addresses
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"]
    }
  }
}));

app.use(cors({
  origin: config.nodeEnv === 'production' 
    ? [process.env.FRONTEND_URL, /\.onrender\.com$/] 
    : true,
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
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));
app.use(express.json({ limit: config.maxRequestSize }));
app.use(express.static(path.join(__dirname, 'public')));

// Initialize markdown parser
const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: true
});

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

function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.warn('Validation errors:', { errors: errors.array(), ip: req.ip });
    return res.status(400).json({
      error: 'Invalid input parameters',
      details: errors.array()
    });
  }
  next();
}

// Basic sanitization
function sanitizeMarkdown(markdown) {
  return markdown
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '');
}

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// DOCX conversion
app.post('/convert/docx', conversionLimiter, validateMarkdownInput, handleValidationErrors, async (req, res) => {
  try {
    const markdownText = sanitizeMarkdown(req.body.markdown);
    const htmlContent = md.render(markdownText);
    const docxTemplate = await fs.readFile(path.join(__dirname, 'templates', 'docx-template.html'), 'utf8');
    const styledHtml = docxTemplate.replace('{{markdownContent}}', htmlContent);
    const docxBuffer = await htmlToDocx(styledHtml, null, {
      table: { row: { cantSplit: true } },
      footer: false,
      header: false,
    });

    res.setHeader('Content-Disposition', 'attachment; filename="MarkDraft_converted.docx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.send(docxBuffer);

    logger.info('DOCX conversion completed', { ip: req.ip, size: docxBuffer.length });
  } catch (error) {
    logger.error('DOCX conversion failed', { ip: req.ip, error: error.message });
    res.status(500).json({ error: 'Failed to create Word document' });
  }
});

// PDF conversion
app.post('/convert/pdf', conversionLimiter, validateMarkdownInput, handleValidationErrors, async (req, res) => {
  let browser;
  try {
    const { markdown: markdownText, orientation = 'portrait' } = req.body;
    const sanitizedMarkdown = sanitizeMarkdown(markdownText);
    const htmlContent = md.render(sanitizedMarkdown);
    const pdfTemplate = await fs.readFile(path.join(__dirname, 'templates', 'pdf-template.html'), 'utf8');
    const styledHtml = pdfTemplate.replace('{{markdownContent}}', htmlContent);

    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 800 });
    await page.setContent(styledHtml, { waitUntil: 'networkidle0', timeout: 30000 });
    
    const pdfBuffer = await page.pdf({
      printBackground: true,
      margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' },
      landscape: orientation === 'landscape',
      preferCSSPageSize: false,
      timeout: 60000
    });

    const filename = `MarkDraft_${orientation}.pdf`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/pdf');
    res.send(pdfBuffer);

    logger.info('PDF conversion completed', { ip: req.ip, size: pdfBuffer.length, orientation });
  } catch (error) {
    logger.error('PDF conversion failed', { ip: req.ip, error: error.message });
    
    let errorMessage = 'Failed to generate PDF document';
    if (error.message && error.message.includes('timeout')) {
      errorMessage = 'PDF generation timed out. The document might be too complex or large.';
    }
    
    res.status(500).json({ error: errorMessage });
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        logger.error('Error closing browser', { error: closeError.message });
      }
    }
  }
});

// Serve main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling
app.use((err, req, res, next) => {
  logger.error('Unhandled error', { error: err.message, url: req.url, method: req.method });
  res.status(500).json({ error: 'An unexpected server error occurred' });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found', path: req.path });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Start server
const server = app.listen(config.port, () => {
  logger.info(`MarkDraft server running at http://localhost:${config.port}`, {
    environment: config.nodeEnv,
    port: config.port
  });
});

server.on('error', (error) => {
  logger.error('Server error', { error: error.message });
});

module.exports = app;