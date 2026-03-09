import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

export default defineConfig({
  root: __dirname,
  cacheDir: '../../../node_modules/.vite/apps/dungeon/game',
  server: {
    port: 4200,
    host: '0.0.0.0',
  },
  preview: {
    port: 4200,
    host: '0.0.0.0',
  },
  plugins: [react(), nxViteTsPaths()],
  build: {
    outDir: '../../../dist/apps/dungeon/game',
    reportCompressedSize: true,
    commonjsOptions: { transformMixedEsModules: true },
  },
});
