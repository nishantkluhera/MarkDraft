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
  
  // Verbose output
  verbose: true,
  
  // Handle static files
  moduleNameMapping: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2)$': '<rootDir>/tests/__mocks__/fileMock.js'
  }
}; 