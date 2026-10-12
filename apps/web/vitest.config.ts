import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: { alias: { '@': resolve(__dirname, 'src') } },
  // Same JSX transform as Next (tsconfig has jsx: preserve), for the slide renderer tests.
  esbuild: { jsx: 'automatic' },
  test: {
    include: ['src/**/*.test.ts'],
    // Tests must not depend on the machine timezone.
    env: { TZ: 'America/New_York' },
  },
})
