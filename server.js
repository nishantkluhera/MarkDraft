// server.js
const express = require('express');
const path = require('path');
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

    // 2. Prepare styled HTML for Word
    const styledHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          /* Styles optimized for Word compatibility */
          body { font-family: Calibri, sans-serif; font-size: 11pt; line-height: 1.15; }
          h1 { font-size: 16pt; color: #2F5496; font-weight: bold; margin-top: 24pt; margin-bottom: 6pt; page-break-after: avoid; }
          h2 { font-size: 13pt; color: #2F5496; font-weight: bold; margin-top: 18pt; margin-bottom: 4pt; page-break-after: avoid; }
          h3 { font-size: 12pt; color: #1F3864; font-weight: bold; margin-top: 14pt; margin-bottom: 4pt; page-break-after: avoid; }
          h4 { font-size: 11pt; color: #1F3864; font-weight: bold; font-style: italic; margin-top: 12pt; margin-bottom: 4pt; page-break-after: avoid; }
          h5 { font-size: 11pt; color: #2F5496; font-weight: bold; margin-top: 12pt; margin-bottom: 4pt; page-break-after: avoid; }
          h6 { font-size: 11pt; color: #1F3864; font-style: italic; margin-top: 12pt; margin-bottom: 4pt; page-break-after: avoid; }
          p { margin-bottom: 6pt; }
          ul, ol { margin-top: 0; margin-bottom: 6pt; padding-left: 36pt; }
          li { margin-bottom: 3pt; }
          code { font-family: Consolas, monospace; background-color: #f0f0f0; padding: 1px 3px; border-radius: 3px; font-size: 10pt; }
          pre { background-color: #f0f0f0; padding: 10px; border: 1px solid #ccc; border-radius: 4px; white-space: pre-wrap; word-wrap: break-word; font-family: Consolas, monospace; font-size: 10pt; margin-bottom: 6pt; }
          pre code { background-color: transparent; border: none; padding: 0; border-radius: 0; font-size: 10pt; }
          blockquote { border-left: 3px solid #ccc; padding-left: 10px; margin-left: 5px; color: #555; margin-bottom: 6pt; }
          table { border-collapse: collapse; width: 100%; margin-bottom: 10pt; border: 1px solid #ddd; }
          th, td { border: 1px solid #ddd; padding: 6px; text-align: left; vertical-align: top; }
          th { background-color: #f2f2f2; font-weight: bold; }
          hr { border: 0; border-top: 1px solid #ccc; margin: 12pt 0; }
          a { color: #0563c1; text-decoration: underline; }
          /* Prevent images from causing large gaps */
          img { max-width: 100%; height: auto; display: block; margin-bottom: 6pt; }
        </style>
      </head>
      <body>
        ${htmlContent}
      </body>
      </html>
    `;

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
    // *** UPDATED: Extract orientation from request body ***
    const { markdown: markdownText, orientation = 'portrait' } = req.body; // Default to 'portrait' if not provided

    if (!markdownText) {
      return res.status(400).json({ error: 'Markdown content is required.' });
    }

    // 1. Convert Markdown to HTML
    const htmlContent = md.render(markdownText);

    // 2. Prepare styled HTML for PDF (using GitHub-like styles)
     const styledHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          /* Comprehensive styles for better PDF rendering */
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
            line-height: 1.6; color: #24292e; background-color: #fff;
            padding: 40px; font-size: 10pt;
          }
          h1, h2, h3, h4, h5, h6 { margin-top: 24px; margin-bottom: 16px; font-weight: 600; line-height: 1.25; color: #24292e; page-break-after: avoid; }
          h1 { font-size: 2em; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
          h2 { font-size: 1.5em; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
          h3 { font-size: 1.25em; }
          h4 { font-size: 1em; }
          h5 { font-size: 0.875em; }
          h6 { font-size: 0.85em; color: #6a737d; }
          p { margin-top: 0; margin-bottom: 16px; }
          a { color: #0366d6; text-decoration: none; }
          a:hover { text-decoration: underline; }
          code { font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace; background-color: rgba(27,31,35,0.05); padding: 0.2em 0.4em; margin: 0; font-size: 85%; border-radius: 3px; }
          pre { font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace; padding: 16px; overflow: auto; font-size: 85%; line-height: 1.45; background-color: #f6f8fa; border-radius: 3px; margin-top: 0; margin-bottom: 16px; word-wrap: normal; page-break-inside: avoid; border: 1px solid #eaecef; }
          pre code { display: inline; max-width: auto; padding: 0; margin: 0; overflow: visible; line-height: inherit; word-wrap: normal; background-color: transparent; border: 0; font-size: 100%; white-space: pre; color: inherit; }
          blockquote { padding: 0 1em; color: #6a737d; border-left: 0.25em solid #dfe2e5; margin-left: 0; margin-right: 0; margin-top: 0; margin-bottom: 16px; }
          blockquote > :first-child { margin-top: 0; }
          blockquote > :last-child { margin-bottom: 0; }
          ul, ol { padding-left: 2em; margin-top: 0; margin-bottom: 16px; }
          li { word-wrap: break-word; } /* Allow breaking long words */
          li > p { margin-top: 0.2em; margin-bottom: 0.2em; }
          li + li { margin-top: 0.25em; }
          table { border-collapse: collapse; width: 100%; display: table; /* Use table display for better page breaking */ overflow-x: auto; margin-top: 0; margin-bottom: 16px; border-spacing: 0; page-break-inside: auto; /* Allow tables to break */ border: 1px solid #dfe2e5; }
          table tr { page-break-inside: avoid; page-break-after: auto; } /* Avoid breaking rows */
          table th, table td { padding: 6px 13px; border: 1px solid #dfe2e5; text-align: left; vertical-align: top; }
          table th { font-weight: 600; background-color: #f6f8fa; }
          hr { height: 0.25em; padding: 0; margin: 24px 0; background-color: #e1e4e8; border: 0; overflow: hidden; box-sizing: content-box; }
          img { max-width: 100%; height: auto; box-sizing: content-box; background-color: #fff; display: block; margin-bottom: 16px; page-break-inside: avoid; }
        </style>
      </head>
      <body>
        ${htmlContent}
      </body>
      </html>
    `;

    // 3. Launch Puppeteer
    // Use appropriate args for different environments (especially deployment)
    browser = await puppeteer.launch({
        headless: 'new', // Use the new headless mode
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage', // Common fix for resource-constrained environments
            '--font-render-hinting=none' // Can sometimes improve text rendering consistency
        ]
    });
    const page = await browser.newPage();

    // 4. Generate PDF using orientation option
    // *** UPDATED: Define pdfOptions including landscape based on input ***
    const pdfOptions = {
      // format: 'A4', // Standard A4 size
      printBackground: true, // Crucial for styled elements
      margin: { // Define margins
        top: '20mm',
        right: '15mm',
        bottom: '20mm',
        left: '15mm',
      },
      landscape: orientation === 'landscape', // Set landscape: true if orientation is 'landscape'
      // Prefer CSS page breaks for better control over where breaks happen
      preferCSSPageSize: false, // Set to true if using @page CSS rules for size/margins
    };

    // Set content and wait for network/rendering
    await page.setContent(styledHtml, { waitUntil: 'networkidle0' });

    // Generate PDF buffer
    const pdfBuffer = await page.pdf(pdfOptions);

    // 5. Close the browser instance
    await browser.close();

    // 6. Send PDF file as response
    // *** UPDATED: Include orientation in suggested filename ***
    const filename = `MarkDraft_${orientation}.pdf`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`); // Use quotes
    res.setHeader('Content-Type', 'application/pdf');
    res.send(pdfBuffer);

  } catch (error) {
    console.error('PDF Conversion Error:', error);
    // Ensure browser is closed even if an error occurs
    if (browser) {
      await browser.close();
    }
    // Provide a more informative error message
    let errorMessage = 'Failed to generate PDF document.';
    if (error.message && (error.message.includes('timeout') || error.message.includes('ERR_CONNECTION_REFUSED'))) {
        errorMessage = 'PDF generation timed out or the rendering engine failed. The document might be too complex or large for current resources.';
    } else if (error.message && error.message.includes('memory')) {
        errorMessage = 'PDF generation failed due to insufficient memory resources.';
    }
    res.status(500).json({ error: errorMessage });
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