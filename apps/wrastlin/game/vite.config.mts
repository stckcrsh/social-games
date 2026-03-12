import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

export default defineConfig({
  root: __dirname,
  cacheDir: '../../../node_modules/.vite/apps/wrastlin/game',
  server: {
    port: 4300,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://localhost:3002',
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
  preview: {
    port: 4300,
    host: '0.0.0.0',
  },
  plugins: [react(), nxViteTsPaths()],
  build: {
    outDir: '../../../dist/apps/wrastlin/game',
    reportCompressedSize: true,
    commonjsOptions: { transformMixedEsModules: true },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.spec.tsx', 'src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: '../../../coverage/apps/wrastlin/game',
    },
  },
});
