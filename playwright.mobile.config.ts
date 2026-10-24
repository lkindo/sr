import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/mobile',
  globalSetup: './e2e/mobile/global-setup.ts',
  timeout: 240_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: 'test-results/mobile-workflow',
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/mobile', open: 'never' }]],
  use: {
    baseURL: 'http://localhost:3100',
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    actionTimeout: 15_000,
    navigationTimeout: 60_000,
    screenshot: 'only-on-failure',
    // Authentication is exercised through the UI: do not retain credential-bearing traces.
    trace: 'off',
  },
  projects: [
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 13'] } },
  ],
  webServer: {
    command: 'pnpm dev --port 3100',
    url: 'http://localhost:3100/login',
    // An existing server does not inherit TEST_MODE. Reuse only a manually verified test server.
    reuseExistingServer: !process.env.CI && process.env.MOBILE_E2E_REUSE_SERVER === 'true',
    timeout: 120_000,
    env: {
      NEXT_DIST_DIR: '.next-e2e',
      TEST_MODE: 'true',
      PLAYWRIGHT_TEST: 'true',
      AUTH_URL: 'http://localhost:3100',
      NEXTAUTH_URL: 'http://localhost:3100',
      RATE_LIMIT_STRICT_MAX_REQUESTS: '100',
      RATE_LIMIT_MIDDLEWARE_MAX_REQUESTS: '2000',
    },
  },
});
