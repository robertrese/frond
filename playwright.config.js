// End-to-end tests: real Chromium against the built site served from /frond/.
// Run after the build:  npx playwright test
// Against the live site:  BASE_URL=https://robertrese.github.io/frond/ npx playwright test
const { defineConfig, devices } = require('@playwright/test');
const live = process.env.BASE_URL;

module.exports = defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    baseURL: live || 'http://127.0.0.1:4173/frond/',
    trace: 'retain-on-failure',
    serviceWorkers: 'allow',
  },
  webServer: live ? undefined : {
    command: 'node tests/e2e/serve.js',
    url: 'http://127.0.0.1:4173/frond/',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    // a 390px touch phone and the narrowest common phone, plus a desktop with a mouse
    { name: 'phone-390', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
    { name: 'phone-360', use: { ...devices['Pixel 7'], viewport: { width: 360, height: 740 } } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
});
