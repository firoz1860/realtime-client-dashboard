import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'

/**
 * Config for the isolation suite, which needs a real database.
 *
 * Spec: docs/superpowers/specs/2026-09-28-multi-tenant-workspaces-design.md §8
 *
 * A separate config exists for one specific reason: the unit config's
 * `tests/setup.ts` deliberately points DATABASE_URL at a non-existent database
 * so the mocked specs can never reach a real one. `src/lib/prisma` reads
 * DATABASE_URL when it is imported, so running these tests under that setup
 * would connect them to nothing. Here DATABASE_URL is set from
 * TEST_DATABASE_URL instead, which is never the production variable.
 */
const readTestDatabaseUrl = (): string => {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL
  try {
    const match = readFileSync('.env.test', 'utf8').match(/^TEST_DATABASE_URL=(.+)$/m)
    return match?.[1] ? match[1].trim() : ''
  } catch {
    return ''
  }
}

const url = readTestDatabaseUrl()

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    clearMocks: true,
    restoreMocks: true,
    // Isolation assertions read and write shared rows, so they must not race.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: url,
      TEST_DATABASE_URL: url,
      JWT_ACCESS_SECRET: 'integration-access-secret-at-least-32-characters',
      JWT_REFRESH_SECRET: 'integration-refresh-secret-at-least-32-characters',
      JWT_ISSUER: 'realtime-client-dashboard',
      JWT_AUDIENCE: 'realtime-client-dashboard-web',
      ACCESS_TOKEN_EXPIRES_IN: '15m',
      REFRESH_TOKEN_EXPIRES_IN: '7d',
      CLIENT_URL: 'http://localhost:3000'
    }
  }
})
