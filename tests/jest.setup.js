/**
 * Jest global setup file.
 *
 * Runs before every test module is imported, so browser globals are available
 * to any src/ module that reads them at module-evaluation time (e.g. utils.js
 * initialises TITLE from browser.i18n at the top level).
 *
 * Loaded via jest.config.mjs → setupFiles.
 */

import { jest } from "@jest/globals";

// ---------------------------------------------------------------------------
// Minimal browser global
// ---------------------------------------------------------------------------

global.browser = {
  i18n: {
    getMessage: jest.fn((key) => key), // return the key itself as a stub string
    getUILanguage: jest.fn(() => "en"),
  },
  storage: {
    local: {
      // Implementations are overridden per-test where needed;
      // stubs prevent "not a function" errors in modules that are only
      // transitively imported.
      get: jest.fn(async () => ({})),
      set: jest.fn(async () => {}),
      remove: jest.fn(async () => {}),
      clear: jest.fn(async () => {}),
    },
  },
  notifications: {
    create: jest.fn(async () => "stub-notification-id"),
    onClicked: { addListener: jest.fn() },
  },
  runtime: {
    getManifest: jest.fn(() => ({ version: "6.2.4", default_locale: "en" })),
    getURL: jest.fn((p) => `moz-extension://stub/${p}`),
    openOptionsPage: jest.fn(async () => {}),
    sendMessage: jest.fn(async () => {}),
  },
  tabs: {
    query: jest.fn(async () => []),
    sendMessage: jest.fn(async () => {}),
    reload: jest.fn(async () => {}),
  },
  windows: {
    create: jest.fn(async () => ({ id: 1 })),
    remove: jest.fn(async () => {}),
    onRemoved: { addListener: jest.fn() },
  },
};
