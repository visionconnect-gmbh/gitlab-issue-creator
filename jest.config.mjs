/**
 * Jest configuration for the thunderbird-gitlab-issue extension.
 *
 * Uses the "experimental VM modules" flag to support native ES modules
 * (import/export) without a transpilation step.
 *
 * Run tests with:
 *   npm test
 *
 * or directly:
 *   node --experimental-vm-modules node_modules/.bin/jest
 */

/** @type {import('jest').Config} */
const config = {
  // Use the Node environment (no DOM needed for unit tests).
  testEnvironment: "node",

  // Run this file before every test suite so that browser globals exist at
  // module-evaluation time (some src/ modules read browser.* at the top level).
  setupFiles: ["./tests/jest.setup.js"],

  // Where to find tests.
  testMatch: ["**/tests/**/*.test.js"],

  // Show each test name while running.
  verbose: true,

  // Coverage configuration (run with: npm test -- --coverage).
  collectCoverageFrom: [
    "src/**/*.js",
    // Exclude entry points that are tightly coupled to the browser runtime.
    "!src/popup/issue_creator.js",
    "!src/options/options.js",
    "!background.js",
  ],
  coverageReporters: ["text", "lcov"],
};

export default config;
