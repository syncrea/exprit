/**
 * Serves `dist/` the way GitHub Pages does (directory index files, 404.html
 * for unknown paths), for the smoke tests. `astro preview` detaches into the
 * background in non-interactive shells, which Playwright cannot manage.
 */
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../dist', import.meta.url)));
const port = Number(process.env.PORT ?? 4329);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
};

const resolveFile = async (pathname) => {
  const safe = normalize(decodeURIComponent(pathname)).replace(
    /^(\.\.[/\\])+/,
    '',
  );
  const candidate = join(root, safe);
  if (!candidate.startsWith(root)) {
    return undefined;
  }
  for (const file of [
    candidate,
    join(candidate, 'index.html'),
    `${candidate}.html`,
  ]) {
    try {
      if ((await stat(file)).isFile()) {
        return file;
      }
    } catch {
      // Not this candidate; try the next one.
    }
  }
  return undefined;
};

createServer(async (request, response) => {
  const { pathname } = new URL(request.url ?? '/', 'http://localhost');
  const file = await resolveFile(pathname);
  const target = file ?? join(root, '404.html');
  response.writeHead(file ? 200 : 404, {
    'content-type': TYPES[extname(target)] ?? 'application/octet-stream',
  });
  createReadStream(target).pipe(response);
}).listen(port, '127.0.0.1', () => {
  console.log(`Serving ${root} at http://127.0.0.1:${port}`);
});
