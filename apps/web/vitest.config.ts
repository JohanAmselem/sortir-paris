import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: { alias: { '@': resolve(__dirname, 'src') } },
  test: {
    include: ['src/**/*.test.ts'],
    // Tests must not depend on the machine timezone.
    env: { TZ: 'America/New_York' },
  },
})
