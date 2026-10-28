#!/usr/bin/env node
/**
 * Bundle the CLI into a single executable ESM file.
 *
 * The CLI shares the engine with the web app, but Node cannot run the
 * TypeScript sources directly, so esbuild inlines everything (including the
 * CJS-only gifenc/gifuct-js dependencies) into dist/cli/gif-masher.mjs.
 */
import { build } from 'esbuild';
import { chmod, mkdir } from 'node:fs/promises';

const outfile = 'dist/cli/gif-masher.mjs';

await mkdir('dist/cli', { recursive: true });

await build({
  entryPoints: ['src/cli/index.ts'],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  sourcemap: false,
  minify: false,
  logLevel: 'info',
  // esbuild preserves the `#!` line from src/cli/index.ts, so no banner here.
});

await chmod(outfile, 0o755);
console.log(`\nCLI ready: ${outfile}`);
