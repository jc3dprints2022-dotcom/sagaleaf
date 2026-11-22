import { defineConfig } from '@playwright/test'

// Tests run against the published repo root (npm run publish first), exactly as GitHub Pages serves it.
export default defineConfig({
  testDir: 'tests',
  timeout: 90_000,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4610',
    launchOptions: { executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
    trace: 'off',
  },
  webServer: { command: 'npx serve -l 4610 --no-clipboard ..', url: 'http://localhost:4610/leaf/', reuseExistingServer: true, timeout: 30_000 },
})
