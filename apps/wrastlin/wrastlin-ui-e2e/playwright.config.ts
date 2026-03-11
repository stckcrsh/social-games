import { defineConfig } from '@playwright/test';
import { workspaceRoot } from '@nx/devkit';

export default defineConfig({
  testDir: './src',
  workers: 1,
  globalSetup: './src/global-setup.ts',
  globalTeardown: './src/global-teardown.ts',
  use: {
    baseURL: 'http://localhost:3002',
  },
  webServer: {
    command: 'node scripts/build.js && node dist/main.js',
    cwd: `${workspaceRoot}/apps/wrastlin/meta-service`,
    url: 'http://localhost:3002/health',
    reuseExistingServer: false,
    env: {
      STATIC_DATA_DIR: '/tmp/wrastlin-e2e/static',
      DYNAMIC_DATA_DIR: '/tmp/wrastlin-e2e/runtime',
    },
  },
  projects: [
    {
      name: 'api',
      testMatch: ['**/*.api.spec.ts'],
      use: { baseURL: 'http://localhost:3002' },
    },
    {
      name: 'chromium',
      testMatch: ['**/browser/**/*.spec.ts'],
      use: { browserName: 'chromium' },
    },
  ],
});
