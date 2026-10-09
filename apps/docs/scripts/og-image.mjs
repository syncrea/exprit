/**
 * Renders the social card (public/og.png, 1200×630, from the "A · Spark" OG
 * artboard) and the touch icon (public/apple-touch-icon.png, 180×180) with
 * headless Chromium and the self-hosted Geist fonts. The PNGs are committed;
 * re-run after changing the design: `pnpm nx run docs:og-image`.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
// Inlined as data URIs: a page created with setContent cannot load file:// fonts.
const font = (pkg, file) =>
  `data:font/woff2;base64,${readFileSync(
    join(dirname(require.resolve(`${pkg}/package.json`)), 'files', file),
  ).toString('base64')}`;

const SPARK =
  'M12 1C12.8 7.5 16.5 11.2 23 12C16.5 12.8 12.8 16.5 12 23C11.2 16.5 7.5 12.8 1 12C7.5 11.2 11.2 7.5 12 1Z';

const fonts = `
@font-face { font-family: 'Geist Sans'; font-weight: 600; src: url(${font('@fontsource/geist-sans', 'geist-sans-latin-600-normal.woff2')}) format('woff2'); }
@font-face { font-family: 'Geist Mono'; font-weight: 400; src: url(${font('@fontsource/geist-mono', 'geist-mono-latin-400-normal.woff2')}) format('woff2'); }
@font-face { font-family: 'Geist Mono'; font-weight: 600; src: url(${font('@fontsource/geist-mono', 'geist-mono-latin-600-normal.woff2')}) format('woff2'); }
body { margin: 0; }
`;

const ogHtml = `<!doctype html><html><head><meta charset="utf-8"><style>${fonts}
.card { width: 1200px; height: 630px; box-sizing: border-box; padding: 64px 72px; background-color: #0A0B0D;
  background-image: radial-gradient(#1A1D22 1.2px, transparent 1.2px); background-size: 24px 24px; color: #EDEFF2;
  font-family: 'Geist Sans', sans-serif; display: flex; flex-direction: column; justify-content: space-between; }
.top { display: flex; align-items: center; justify-content: space-between; }
.mark { font-family: 'Geist Mono', monospace; font-weight: 600; letter-spacing: -0.05em; font-size: 48px; line-height: 1; display: inline-flex; align-items: baseline; }
.i { position: relative; display: inline-block; }
.i svg { position: absolute; left: 50%; top: -0.14em; width: 0.4em; height: 0.4em; transform: translateX(-50%); }
.npm { font-family: 'Geist Mono', monospace; font-size: 22px; color: #8A9099; }
h1 { margin: 0; font-weight: 600; font-size: 96px; line-height: 0.98; letter-spacing: -0.045em; }
.demo { display: flex; align-items: center; gap: 28px; padding: 26px 32px; border-radius: 18px; background: #121418; border: 1px solid #23262D; font-family: 'Geist Mono', monospace; }
.expr { font-size: 34px; letter-spacing: -0.02em; }
.value { font-weight: 600; font-size: 52px; letter-spacing: -0.03em; color: #C6FF3D; }
</style></head><body><div class="card">
  <div class="top">
    <span class="mark">expr<span class="i">ı<svg viewBox="0 0 24 24"><path d="${SPARK}" fill="#C6FF3D"/></svg></span>t</span>
    <span class="npm">npm i @syncrea/exprit</span>
  </div>
  <h1>Expressions,<br>evaluated.</h1>
  <div class="demo">
    <span class="expr">2 + price * qty</span>
    <svg viewBox="0 0 24 24" width="30" height="30" style="margin-left: auto"><path d="${SPARK}" fill="#C6FF3D"/></svg>
    <span class="value">15.5</span>
  </div>
</div></body></html>`;

const iconHtml = `<!doctype html><html><head><style>body { margin: 0; }</style></head><body>
<div style="width: 180px; height: 180px; background: #C6FF3D; display: flex; align-items: center; justify-content: center">
  <svg viewBox="0 0 24 24" width="100" height="100"><path d="${SPARK}" fill="#0A0B0D"/></svg>
</div></body></html>`;

const browser = await chromium.launch();
try {
  const og = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await og.setContent(ogHtml, { waitUntil: 'load' });
  await og.evaluate(() => document.fonts.ready);
  await og.screenshot({ path: join(appRoot, 'public', 'og.png') });

  const icon = await browser.newPage({ viewport: { width: 180, height: 180 } });
  await icon.setContent(iconHtml);
  await icon.screenshot({
    path: join(appRoot, 'public', 'apple-touch-icon.png'),
  });
} finally {
  await browser.close();
}
console.log('Wrote public/og.png and public/apple-touch-icon.png');
