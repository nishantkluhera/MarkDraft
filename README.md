# MarkDraft

A simple web app to convert Markdown to Word documents and PDFs. Built because I got tired of copying and pasting AI-generated content into Google Docs.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node Version](https://img.shields.io/badge/Node.js-%3E%3D18.x-blue.svg)](https://nodejs.org/)

## What it does

- Converts Markdown to .docx files
- Converts Markdown to PDF files (portrait or landscape)
- Works well with content from ChatGPT, Claude, or any LLM
- Has a clean web interface
- No file uploads needed - just paste and convert

## Quick start

```bash
git clone https://github.com/nishantkluhera/MarkDraft.git
cd MarkDraft
npm install
npm start
```

Open http://localhost:3000 and you're good to go.

## Docker

If you prefer Docker:

```bash
docker-compose up -d
```

## What's included

- Express.js server
- Markdown parsing with markdown-it
- Word document generation using html-to-docx
- PDF generation with Puppeteer
- Basic security headers and rate limiting
- Responsive web UI

## Development

```bash
npm run dev          # Start with nodemon
npm test             # Run tests
npm run lint         # Check code style
```

## Security stuff

- Input validation and sanitization
- Rate limiting (10 conversions per 15 minutes)
- CORS protection
- Standard security headers
- No file storage (everything's processed in memory)

## Contributing

PRs welcome! Just make sure tests pass and code is clean.

## License

MIT - do whatever you want with it.
