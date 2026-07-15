import { defineConfig } from '@playwright/test';

/**
 * E2E tests run against a real server booted with the deterministic `mock`
 * LLM provider, so they need no API key and no network access.
 */
export default defineConfig({
  testDir: './test/e2e',
  testMatch: '**/*.e2e-spec.ts',
  timeout: 30_000,
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3100',
  },
  webServer: {
    command: 'npm run start',
    port: 3100,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      LLM_PROVIDER: 'mock',
      PORT: '3100',
      // Deterministic provider availability for the /providers test:
      // gemini "enabled", openai "needs key". No test makes a real gemini call.
      GEMINI_API_KEY: 'test-gemini-key',
      OPENAI_API_KEY: '',
    },
  },
});
