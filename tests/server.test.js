const request = require('supertest');
const app = require('../server');

describe('MarkDraft API', () => {
  // Test health endpoint
  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('version');
    });
  });

  // Test root endpoint
  describe('GET /', () => {
    it('should serve the main HTML file', async () => {
      const response = await request(app)
        .get('/')
        .expect(200);

      expect(response.text).toContain('MarkDraft');
      expect(response.text).toContain('<!DOCTYPE html>');
    });
  });

  // Test static file serving
  describe('GET /style.css', () => {
    it('should serve CSS file', async () => {
      const response = await request(app)
        .get('/style.css')
        .expect(200);

      expect(response.headers['content-type']).toMatch(/css/);
    });
  });

  // Test DOCX conversion
  describe('POST /convert/docx', () => {
    it('should convert valid markdown to DOCX', async () => {
      const markdownContent = '# Test Header\n\nThis is a **test** document with *italic* text.';

      const response = await request(app)
        .post('/convert/docx')
        .send({ markdown: markdownContent })
        .expect(200);

      expect(response.headers['content-type']).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.headers['content-disposition']).toContain('MarkDraft_converted.docx');
    });

    it('should reject empty markdown', async () => {
      const response = await request(app)
        .post('/convert/docx')
        .send({ markdown: '' })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should reject missing markdown', async () => {
      const response = await request(app)
        .post('/convert/docx')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should reject overly long markdown', async () => {
      const longMarkdown = 'a'.repeat(1000001); // Over 1MB

      const response = await request(app)
        .post('/convert/docx')
        .send({ markdown: longMarkdown })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  // Test PDF conversion
  describe('POST /convert/pdf', () => {
    it('should convert valid markdown to PDF (portrait)', async () => {
      const markdownContent = '# Test Header\n\nThis is a **test** document.';

      const response = await request(app)
        .post('/convert/pdf')
        .send({
          markdown: markdownContent,
          orientation: 'portrait'
        })
        .responseType('blob')
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.headers['content-disposition']).toContain('MarkDraft_portrait.pdf');
      // Body must be raw PDF bytes, not a JSON-serialized typed array.
      expect(Buffer.isBuffer(response.body)).toBe(true);
      expect(response.body.slice(0, 5).toString()).toBe('%PDF-');
    }, 30000); // 30 second timeout for PDF generation

    it('should convert valid markdown to PDF (landscape)', async () => {
      const markdownContent = '# Test Header\n\nThis is a **test** document.';

      const response = await request(app)
        .post('/convert/pdf')
        .send({
          markdown: markdownContent,
          orientation: 'landscape'
        })
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['content-disposition']).toContain('MarkDraft_landscape.pdf');
    }, 30000);

    it('should default to portrait orientation', async () => {
      const markdownContent = '# Test Header\n\nThis is a **test** document.';

      const response = await request(app)
        .post('/convert/pdf')
        .send({ markdown: markdownContent })
        .expect(200);

      expect(response.headers['content-disposition']).toContain('MarkDraft_portrait.pdf');
    }, 30000);

    it('should reject invalid orientation', async () => {
      const markdownContent = '# Test Header\n\nThis is a **test** document.';

      const response = await request(app)
        .post('/convert/pdf')
        .send({
          markdown: markdownContent,
          orientation: 'invalid'
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  // Test live preview endpoint
  describe('POST /preview', () => {
    it('should render markdown to sanitized HTML', async () => {
      const response = await request(app)
        .post('/preview')
        .send({ markdown: '# Hello\n\nSome **bold** text.' })
        .expect(200);

      expect(response.body).toHaveProperty('html');
      expect(response.body.html).toContain('<h1>Hello</h1>');
      expect(response.body.html).toContain('<strong>bold</strong>');
    });

    it('should return empty html for empty input', async () => {
      const response = await request(app)
        .post('/preview')
        .send({ markdown: '' })
        .expect(200);

      expect(response.body).toHaveProperty('html', '');
    });

    it('should syntax-highlight fenced code blocks', async () => {
      const response = await request(app)
        .post('/preview')
        .send({ markdown: '```js\nconst x = 1;\n```' })
        .expect(200);

      // highlight.js wraps tokens in hljs-prefixed spans/classes.
      expect(response.body.html).toContain('class="hljs');
      expect(response.body.html).toContain('hljs-keyword');
    });

    it('should strip script tags from rendered output', async () => {
      const response = await request(app)
        .post('/preview')
        .send({ markdown: '<script>alert("xss")</script>\n\n# Safe' })
        .expect(200);

      expect(response.body.html).not.toContain('<script>');
      expect(response.body.html).toContain('<h1>Safe</h1>');
    });

    it('should reject markdown over the size limit', async () => {
      const response = await request(app)
        .post('/preview')
        .send({ markdown: 'a'.repeat(1000001) })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  // Test error handling
  describe('Error handling', () => {
    it('should handle 404 for non-existent routes', async () => {
      const response = await request(app)
        .get('/non-existent-route')
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Route not found');
    });

    it('should handle invalid JSON', async () => {
      await request(app)
        .post('/convert/docx')
        .set('Content-Type', 'application/json')
        .send('invalid json')
        .expect(400);
    });
  });

  // Test security headers
  describe('Security headers', () => {
    it('should include security headers', async () => {
      const response = await request(app)
        .get('/')
        .expect(200);

      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers).toHaveProperty('x-frame-options');
      expect(response.headers).toHaveProperty('x-xss-protection');
    });
  });

  // Test rate limiting (simplified)
  describe('Rate limiting', () => {
    it('should accept requests within rate limit', async () => {
      const markdownContent = '# Test';

      // Make a few requests
      for (let i = 0; i < 3; i++) {
        await request(app)
          .post('/convert/docx')
          .send({ markdown: markdownContent })
          .expect(200);
      }
    });
  });

  // Test input sanitization
  describe('Input sanitization', () => {
    it('should sanitize script tags', async () => {
      const maliciousMarkdown = '<script>alert("xss")</script>\n# Safe content';

      const response = await request(app)
        .post('/convert/docx')
        .send({ markdown: maliciousMarkdown })
        .expect(200);

      // Should not fail and should generate a document
      expect(response.headers['content-type']).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    });

    it('should sanitize iframe tags', async () => {
      const maliciousMarkdown = '<iframe src="javascript:alert(1)"></iframe>\n# Safe content';

      const response = await request(app)
        .post('/convert/docx')
        .send({ markdown: maliciousMarkdown })
        .expect(200);

      expect(response.headers['content-type']).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    });
  });
});
