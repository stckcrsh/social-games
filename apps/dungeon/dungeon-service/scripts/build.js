#!/usr/bin/env node
// Build script using esbuild Node API (avoids shell-script wrapper issues on Node 18)
const esbuild = require('esbuild');
const path = require('path');

const root = path.resolve(__dirname, '..');

esbuild.buildSync({
  entryPoints: [path.join(root, 'src/main.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
  outfile: path.join(root, 'dist/main.js'),
  sourcemap: true,
  absWorkingDir: root,
  alias: {
    '@org/shared': path.resolve(root, '../../libs/shared/src/index.ts'),
    '@org/items':  path.resolve(root, '../../libs/items/src/index.ts'),
  },
});

console.log('Build complete: dist/main.js');
