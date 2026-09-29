import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    // tests/setup.ts points DATABASE_URL at a database that does not exist, so
    // the integration suite must not run here. See vitest.integration.config.ts.
    exclude: ['tests/integration/**', 'node_modules/**', 'dist/**'],
    clearMocks: true,
    restoreMocks: true
  }
})
