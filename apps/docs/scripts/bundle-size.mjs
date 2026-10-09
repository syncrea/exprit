/**
 * Measures the size of the published @syncrea/exprit ESM build, minified and
 * gzipped, with every export kept. The landing page reads the result, so the
 * number on the site always comes from the real build, never from a guess.
 *
 * Output: apps/docs/.generated/bundle-size.json. Run through Nx:
 * `pnpm nx run docs:bundle-size` (it depends on the library build).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

import { build } from 'vite';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(appRoot, '.generated');
const entry = join(outDir, 'bundle-size-entry.js');

await mkdir(outDir, { recursive: true });
await writeFile(entry, "export * from '@syncrea/exprit';\n");

const output = await build({
  configFile: false,
  root: appRoot,
  logLevel: 'silent',
  build: {
    write: false,
    minify: true,
    target: 'es2022',
    lib: { entry, formats: ['es'], fileName: 'exprit' },
  },
});

const chunks = (Array.isArray(output) ? output : [output])
  .flatMap((result) => result.output)
  .filter((item) => item.type === 'chunk');
const code = chunks.map((chunk) => chunk.code).join('\n');
const minifiedBytes = Buffer.byteLength(code);
const gzipBytes = gzipSync(code, { level: 9 }).length;

const require = createRequire(import.meta.url);
const pkg = JSON.parse(
  await readFile(require.resolve('@syncrea/exprit/package.json'), 'utf8'),
);

const result = {
  package: pkg.name,
  version: pkg.version,
  format: 'esm, all exports, minified',
  minifiedBytes,
  gzipBytes,
  gzipKb: Number((gzipBytes / 1024).toFixed(1)),
};
await writeFile(
  join(outDir, 'bundle-size.json'),
  `${JSON.stringify(result, null, 2)}\n`,
);
console.log(
  `${pkg.name}@${pkg.version}: ${minifiedBytes} B minified, ${gzipBytes} B gzipped (${result.gzipKb} kB)`,
);
