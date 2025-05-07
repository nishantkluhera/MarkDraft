// server.js
const express = require('express');
const path = require('path');
const fs = require('fs').promises; // Added for async file reading
const MarkdownIt = require('markdown-it');
const htmlToDocx = require('html-to-docx');
const puppeteer = require('puppeteer');

const app = express();
const port = process.env.PORT || 3000; // Use environment variable for port

// Initialize Markdown-it
const md = new MarkdownIt({
  html: true,        // Allow HTML tags in source
  linkify: true,     // Autoconvert URL-like text to links
  typographer: true, // Enable smart quotes and other typographic improvements
  breaks: true       // Convert '\n' in paragraphs into <br>
});

// Middleware
app.use(express.json({ limit: '10mb' })); // Parse JSON bodies, increased limit
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files

// --- API Routes ---

// Route for DOCX Conversion
app.post('/convert/docx', async (req, res) => {
  try {
    const markdownText = req.body.markdown;
    if (!markdownText) {
      return res.status(400).json({ error: 'Markdown content is required.' });
    }

    // 1. Convert Markdown to HTML
    const htmlContent = md.render(markdownText);

    // 2. Read DOCX template and inject content
    let docxTemplate = await fs.readFile(path.join(__dirname, 'templates', 'docx-template.html'), 'utf8');
    const styledHtml = docxTemplate.replace('{{markdownContent}}', htmlContent);

    // 3. Convert HTML to DOCX buffer
    const docxBuffer = await htmlToDocx(styledHtml, null, {
        table: { row: { cantSplit: true } }, // Prevent table rows splitting
        footer: false,
        header: false,
    });

    // 4. Send DOCX file as response
    res.setHeader('Content-Disposition', 'attachment; filename="MarkDraft_converted.docx"'); // Use quotes for filename
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.send(docxBuffer);

  } catch (error) {
    console.error('DOCX Conversion Error:', error);
    res.status(500).json({ error: 'Failed to create Word document.' }); // User-friendly error
  }
});

// Route for PDF Conversion
app.post('/convert/pdf', async (req, res) => {
  let browser; // Declare browser outside try block for finally clause
  try {
    const { markdown: markdownText, orientation = 'portrait' } = req.body;

    if (!markdownText) {
      return res.status(400).json({ error: 'Markdown content is required.' });
    }

    const htmlContent = md.render(markdownText);
    const pdfTemplate = await fs.readFile(path.join(__dirname, 'templates', 'pdf-template.html'), 'utf8');
    const styledHtml = pdfTemplate.replace('{{markdownContent}}', htmlContent);

    browser = await puppeteer.launch({
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--font-render-hinting=none'
        ]
    });
    const page = await browser.newPage();

    const pdfOptions = {
      printBackground: true,
      margin: {
        top: '20mm',
        right: '15mm',
        bottom: '20mm',
        left: '15mm',
      },
      landscape: orientation === 'landscape',
      preferCSSPageSize: false,
    };

    await page.setContent(styledHtml, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf(pdfOptions);
    // Browser is closed in the finally block

    const filename = `MarkDraft_${orientation}.pdf`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/pdf');
    res.send(pdfBuffer);

  } catch (error) {
    console.error('PDF Conversion Error:', error);
    let errorMessage = 'Failed to generate PDF document.';
    if (error.message && (error.message.includes('timeout') || error.message.includes('ERR_CONNECTION_REFUSED'))) {
        errorMessage = 'PDF generation timed out or the rendering engine failed. The document might be too complex or large for current resources.';
    } else if (error.message && error.message.includes('memory')) {
        errorMessage = 'PDF generation failed due to insufficient memory resources.';
    }
    res.status(500).json({ error: errorMessage });
  } finally {
    if (browser) {
      await browser.close(); // Ensure browser is closed
    }
  }
});

// --- Root Route ---
// Serve the main HTML file for the root URL
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Error Handling Middleware (Optional but Recommended) ---
// Catch-all for unhandled errors
app.use((err, req, res, next) => {
  console.error("Unhandled Error:", err.stack || err);
  res.status(500).json({ error: 'An unexpected server error occurred.' });
});

// --- Start Server ---
app.listen(port, () => {
  console.log(`🚀 MarkDraft server running at http://localhost:${port}`);
});