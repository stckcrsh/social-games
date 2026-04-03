#!/usr/bin/env node
const esbuild = require('esbuild');
const path = require('path');

const root = path.resolve(__dirname, '..');

const esmShim = `
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
`.trimStart();

esbuild.buildSync({
  entryPoints: [path.join(root, 'src/main.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  outfile: path.join(root, 'dist/main.js'),
  sourcemap: true,
  absWorkingDir: root,
  alias: {
    '@org/wrastlin-shared': path.resolve(root, '../../../libs/wrastlin/shared/src/index.ts'),
  },
});

esbuild.buildSync({
  entryPoints: [path.join(root, 'src/generate-show.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  outfile: path.join(root, 'dist/generate-show.js'),
  sourcemap: true,
  absWorkingDir: root,
  alias: {
    '@org/wrastlin-shared': path.resolve(root, '../../../libs/wrastlin/shared/src/index.ts'),
  },
});

const runEntries = [
  'run-open-betting',
  'run-close-betting',
  'run-judge',
  'run-resolve-proposition',
  'run-apply-payouts',
];

for (const entry of runEntries) {
  esbuild.buildSync({
    entryPoints: [path.join(root, `src/${entry}.ts`)],
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
    outfile: path.join(root, `dist/${entry}.js`),
    sourcemap: true,
    absWorkingDir: root,
    banner: { js: esmShim },
    alias: {
      '@org/wrastlin-shared': path.resolve(root, '../../../libs/wrastlin/shared/src/index.ts'),
      '@org/auth': path.resolve(root, '../../../libs/shared/auth/src/index.ts'),
    },
  });
}

console.log('Build complete: dist/main.js, dist/generate-show.js, ' + runEntries.map(e => `dist/${e}.js`).join(', '));
