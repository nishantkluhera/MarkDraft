// Jest mock for puppeteer so tests don't launch a real browser (slow + flaky).
// Returns a tiny valid PDF; real rendering is checked manually.

// page.pdf() returns a Uint8Array in puppeteer 24+, so mirror that here
const mockPdfBytes = new Uint8Array(
  Buffer.from('%PDF-1.4\n% mock pdf\n%%EOF\n')
);

const page = {
  setViewport: async () => {},
  setContent: async () => {},
  pdf: async () => mockPdfBytes,
  close: async () => {}
};

// just the bits server.js uses
const browser = {
  connected: true,
  on: () => {},
  newPage: async () => page,
  close: async () => {}
};

const launch = async () => browser;

module.exports = { launch, default: { launch } };
