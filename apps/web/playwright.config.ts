import { defineConfig, devices } from '@playwright/test'

/**
 * E2E smoke tests. Run against a deployed preview (E2E_BASE_URL) — the app
 * needs the real database, so CI triggers them on Vercel deployment_status.
 *   E2E_BASE_URL=https://<preview>.vercel.app pnpm --filter @sortir/web e2e
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    trace: 'retain-on-failure',
    extraHTTPHeaders: process.env.VERCEL_BYPASS ? { 'x-vercel-protection-bypass': process.env.VERCEL_BYPASS } : undefined,
  },
  projects: [
    { name: 'mobile', use: { ...devices['iPhone 13'] } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
  ],
})
