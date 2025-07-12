// Test setup file for Jest

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.PORT = '3001';
process.env.RATE_LIMIT_MAX = '1000';
process.env.CONVERSION_RATE_LIMIT_MAX = '100';

// Increase timeout for async operations
jest.setTimeout(30000);

// Mock console.log to reduce noise during tests
const originalLog = console.log;
console.log = (...args) => {
  if (process.env.JEST_VERBOSE) {
    originalLog(...args);
  }
};

// Clean up after tests
afterAll(() => {
  console.log = originalLog;
}); 