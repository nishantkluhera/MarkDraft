# MarkDraft

A small web app for turning Markdown into Word (.docx) and PDF files, with a live preview. I built it because I kept pasting ChatGPT/Claude output into Google Docs and fixing the formatting by hand.

[![CI](https://github.com/nishantkluhera/MarkDraft/actions/workflows/ci.yml/badge.svg)](https://github.com/nishantkluhera/MarkDraft/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node Version](https://img.shields.io/badge/Node.js-%3E%3D22.x-blue.svg)](https://nodejs.org/)

## Features

- Live preview that updates as you type
- Export to `.docx` and PDF (portrait or landscape)
- Syntax highlighting for code blocks
- Paste text, drop in a `.md` file, or load a sample to try it
- Light/dark theme (follows your OS, with a manual toggle)
- Nothing is uploaded or stored. It all runs in memory.

## Running it

You'll need Node 22+.

```bash
git clone https://github.com/nishantkluhera/MarkDraft.git
cd MarkDraft
npm install
npm start
```

Then open http://localhost:3000. The first `npm install` downloads a Chromium build for Puppeteer (used to render PDFs), so give it a minute.

## Docker

```bash
docker compose up -d
```

The image installs its own Chromium, so PDF generation works without any extra setup.

## How it works

The preview, the Word export and the PDF export all run through the same render function, which is why the preview matches what you download:

```
markdown-it  ->  sanitize-html  ->  preview (HTML) / html-to-docx (.docx) / Puppeteer (PDF)
```

| Endpoint        | Method | What it does                          |
| --------------- | ------ | ------------------------------------- |
| `/`             | GET    | the web UI                            |
| `/preview`      | POST   | Markdown to sanitized HTML            |
| `/convert/docx` | POST   | Markdown to a Word document           |
| `/convert/pdf`  | POST   | Markdown to a PDF (portrait/landscape)|
| `/health`       | GET    | health check (used by Docker)         |

Stack: Express, markdown-it, highlight.js, sanitize-html, html-to-docx, Puppeteer, plus Helmet/CORS/rate-limiting. The frontend is plain HTML/CSS/JS with no build step (system fonts and inline SVG icons, so there are no CDN calls).

## Configuration

Copy `env.example` to `.env` to change the defaults:

| Variable                    | Default       | Notes                                   |
| --------------------------- | ------------- | --------------------------------------- |
| `PORT`                      | `3000`        | server port                             |
| `NODE_ENV`                  | `development` | `production` tightens CORS              |
| `RATE_LIMIT_MAX`            | `600`         | general requests per 15 min per IP      |
| `CONVERSION_RATE_LIMIT_MAX` | `10`          | conversions per 15 min per IP           |
| `FRONTEND_URL`              | (none)        | allowed CORS origin in production       |
| `PUPPETEER_EXECUTABLE_PATH` | (none)        | path to a system Chromium (set in Docker) |
| `PDF_CONCURRENCY`           | `2`           | how many PDFs render at once            |

## Privacy and security

- The rendered HTML is sanitized with sanitize-html before it goes anywhere, so pasted scripts can't end up in the preview or the documents.
- Helmet sets the usual security headers, with a CSP that has no third-party origins (fonts and icons are served locally).
- Rate limiting: 10 conversions and 600 general requests per 15 minutes per IP.
- Nothing is written to disk. Logs don't record IPs or document content.
- PDF generation reuses a single headless browser with a concurrency cap, so memory stays predictable under load.

## Development

```bash
npm run dev          # nodemon with reload
npm test             # Jest + Supertest
npm run lint
```

## License

MIT. Do whatever you want with it.
