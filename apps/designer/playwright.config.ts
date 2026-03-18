import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results/playwright-artifacts',
  timeout: 30_000,
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: process.env.TEST_BASE_URL ?? 'http://localhost:4000',
    screenshot: 'only-on-failure',
    video: 'off',
    headless: true,
  },
  reporter: [
    ['list'],
    ['json', { outputFile: './test-results/playwright-results.json' }],
    ['html', { open: 'never', outputFolder: './test-results/playwright-html' }],
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
