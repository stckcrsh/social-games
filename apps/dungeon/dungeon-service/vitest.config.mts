import { defineConfig } from 'vitest/config';
import path from 'node:path';

const root = import.meta.dirname;

export default defineConfig({
  resolve: {
    alias: {
      '@org/shared': path.resolve(root, '../../libs/shared/src/index.ts'),
      '@org/items':  path.resolve(root, '../../libs/items/src/index.ts'),
    },
  },
  test: {
    globals: false,
    environment: 'node',
    pool: 'forks',
    setupFiles: ['src/__tests__/setup.ts'],
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: '../../coverage/apps/dungeon-service',
    },
  },
});
