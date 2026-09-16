import { defineConfig, devices } from '@playwright/test';

const VIEWPORTS = {
  'desktop-1920': { width: 1920, height: 1080 },
  'desktop-1440': { width: 1440, height: 900 },
  'laptop-1366': { width: 1366, height: 768 },
  'tablet-768': { width: 768, height: 1024 },
  'phone-390': { width: 390, height: 844 },
} as const;

/** Fake camera + mic so the sign and speech flows can be driven headlessly. */
const MEDIA_ARGS = [
  '--use-fake-ui-for-media-stream',
  '--use-fake-device-for-media-stream',
  '--autoplay-policy=no-user-gesture-required',
];

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // The sign suite runs MediaPipe with a GPU delegate in every worker; more than
  // two at once starves them and the camera tests time out on slower machines.
  retries: 1,
  workers: 2,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  timeout: 45_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: Object.entries(VIEWPORTS).map(([name, viewport]) => ({
    name,
    use: {
      ...devices['Desktop Chrome'],
      viewport,
      launchOptions: { args: MEDIA_ARGS },
      permissions: ['microphone', 'camera'],
    },
  })),
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: 'ignore',
  },
});
