/**
 * Minimal playwright config for vertical slice E2E tests.
 * Assumes all services are already running (no webServer management).
 *   dungeon-service: http://localhost:3001
 *   meta-service:    http://localhost:3000
 */
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './src',
  timeout: 30_000,
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'vertical',
      testMatch: '**/meta-dungeon-vertical.spec.ts',
    },
  ],
});
