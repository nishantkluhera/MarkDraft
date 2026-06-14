module.exports = {
  // Test environment
  testEnvironment: 'node',

  // Test file patterns
  testMatch: ['**/tests/**/*.test.js'],

  // Coverage settings
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  collectCoverageFrom: [
    'server.js',
    'public/script.js',
    '!node_modules/**',
    '!coverage/**',
    '!tests/**'
  ],

  // Test setup
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],

  // Timeout for tests (important for PDF generation tests)
  testTimeout: 30000,

  // Use the lightweight Puppeteer stub in __mocks__ instead of launching a real
  // browser during tests.
  moduleNameMapper: {
    '^puppeteer$': '<rootDir>/__mocks__/puppeteer.js'
  },

  // Verbose output
  verbose: true
};
