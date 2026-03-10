#!/usr/bin/env node
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
    '@org/wrastlin-shared': path.resolve(root, '../../../libs/wrastlin/shared/src/index.ts'),
    '@org/betting': path.resolve(root, '../../../libs/shared/betting/src/index.ts'),
  },
});

esbuild.buildSync({
  entryPoints: [path.join(root, 'src/generate-show.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
  outfile: path.join(root, 'dist/generate-show.js'),
  sourcemap: true,
  absWorkingDir: root,
  alias: {
    '@org/wrastlin-shared': path.resolve(root, '../../../libs/wrastlin/shared/src/index.ts'),
    '@org/betting': path.resolve(root, '../../../libs/shared/betting/src/index.ts'),
  },
});

console.log('Build complete: dist/main.js, dist/generate-show.js');
