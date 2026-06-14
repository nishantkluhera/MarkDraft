# Changelog

## [2.1.0] - 2026-06-14

### Added
- Live preview that updates as you type (new `/preview` endpoint, same render path as the exports)
- Syntax highlighting for code blocks (highlight.js), in the preview and the PDF
- Word/character count, a "Load sample" button, and `.md` file upload
- Light/dark theme toggle (follows the OS by default, remembers your choice)
- Favicon

### Changed
- Rendered HTML is sanitized with sanitize-html instead of the old regex stripping
- Frontend reworked into a side-by-side editor/preview (tabs on mobile)
- Dropped the Google Fonts and Font Awesome CDNs: system fonts and inline SVG icons, CSP locked to 'self'
- Logs no longer record IPs or content; files rotate and also go to stdout
- PDFs reuse one headless browser with a concurrency cap instead of launching one per request
- Bumped to Node 22+, latest Puppeteer and markdown-it (clean npm audit)

### Fixed
- Docker installs a system Chromium so PDF export works in containers
- Tests no longer leave the server listening (guarded `app.listen`)
- `logs/` is created on startup; CORS no longer breaks when `FRONTEND_URL` is unset
- PDF responses send raw bytes instead of a JSON-encoded array

## [2.0.0] - 2024-07-13

### Added
- Security headers with Helmet
- Input validation and sanitization
- Rate limiting (10 conversions per 15 minutes)
- CORS protection
- Proper error handling and logging
- Docker support
- Responsive design
- Accessibility features (ARIA labels, keyboard navigation)
- Dark mode support
- Comprehensive test suite
- Code quality tools (ESLint, Prettier)

### Changed
- Rebuilt UI with better mobile support
- Improved server architecture
- Better error messages
- Updated documentation

### Security
- All user inputs are now validated and sanitized
- Added security headers
- Rate limiting to prevent abuse
- Docker containers run as non-root

## [1.0.0] - 2023-12-01

### Added
- Initial release
- Markdown to DOCX conversion
- Markdown to PDF conversion
- Basic web interface
- Express.js server 