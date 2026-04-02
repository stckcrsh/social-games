import { defineConfig } from 'vitest/config';
import path from 'node:path';

const root = import.meta.dirname;

export default defineConfig({
  resolve: {
    alias: {
      '@org/wrastlin-shared': path.resolve(root, '../../../libs/wrastlin/shared/src/index.ts'),
    },
  },
  test: {
    globals: false,
    environment: 'node',
    pool: 'forks',
    include: ['src/**/*.spec.ts', 'promptfoo/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: '../../../coverage/apps/wrastlin/meta-service',
    },
  },
});
