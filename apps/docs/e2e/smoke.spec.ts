import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test, type Page } from '@playwright/test';

const ROUTES = [
  { path: '/', heading: /^Expressions,\s*evaluated\.$/ },
  { path: '/getting-started/', heading: 'Getting started' },
  { path: '/api/', heading: '@syncrea/exprit' },
  { path: '/api/core/', heading: '@syncrea/exprit/core' },
  { path: '/playground/', heading: 'Playground' },
] as const;

const collectErrors = (page: Page): string[] => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  return errors;
};

/** Replaces the CodeMirror document by typing, like a visitor would. */
const typeExpression = async (page: Page, text: string): Promise<void> => {
  const editor = page.getByRole('textbox', { name: 'Expression' });
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Backspace');
  await page.keyboard.type(text);
};

for (const route of ROUTES) {
  test(`${route.path} renders without errors`, async ({ page }) => {
    const errors = collectErrors(page);
    const response = await page.goto(route.path);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      route.heading,
    );
    // Desktop shows the inline nav, phones the menu; both carry the three links.
    await expect(
      page.locator('header nav a[href="/playground/"]').first(),
    ).toBeAttached();
    expect(errors).toEqual([]);
  });
}

test('unknown paths get the 404 page', async ({ page }) => {
  const response = await page.goto('/does-not-exist/');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'This expression has no value.',
  );
});

test('the landing hero evaluates with the real engine', async ({ page }) => {
  await page.goto('/');
  const hero = page.locator('exprit-live.hero-demo');
  const result = hero.locator('output');
  await expect(result).toHaveText('15.5');
  await hero.getByLabel('qty').fill('4');
  await expect(result).toHaveText('20');
  await hero.getByRole('button', { name: 'max(price, 5) * qty' }).click();
  await expect(result).toHaveText('20');
  await hero.getByLabel('Live · evaluated in your browser').fill('price *');
  await expect(result).toContainText('parse error [1:8]');
});

test('the landing mini playground switches dialects', async ({ page }) => {
  await page.goto('/');
  const mini = page.locator('exprit-live.mini');
  await expect(mini.locator('output')).toHaveText('12.15');
  await mini.getByRole('button', { name: 'legacy' }).click();
  await expect(mini.getByLabel('Expression')).toHaveValue(/isMember and qty/);
  await expect(mini.locator('output')).toHaveText('12.15');
  await mini.getByLabel('isMember').uncheck();
  await expect(mini.locator('output')).toHaveText('13.5');
});

test('the guide try-it boxes evaluate', async ({ page }) => {
  await page.goto('/getting-started/');
  const quick = page.locator('exprit-live.try').first();
  await expect(quick.locator('output')).toHaveText('15.5');
  await quick.getByRole('textbox').fill('price * qty * 2');
  await expect(quick.locator('output')).toHaveText('27');
  await expect(
    page.locator('exprit-live.try:has(input[value="user.constructor"]) output'),
  ).toHaveText('access to "constructor" is not allowed');
});

test.describe('playground', () => {
  test('evaluates, tracks variables and reports errors', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/playground/');
    const result = page.locator('#pg-result');
    await expect(result).toHaveText('12.15');
    await expect(page.locator('#pg-result-meta')).toHaveText(
      /^number · \d+ tokens · \d+ nodes$/,
    );

    await typeExpression(page, 'price * qty + bonus');
    const bonus = page.getByLabel('bonus', { exact: true });
    await expect(bonus).toBeVisible();
    await bonus.fill('1.5');
    await expect(result).toHaveText('15');

    await page.getByLabel('Type of bonus').selectOption('string');
    // Modern `+` is JavaScript's: a string operand concatenates.
    await expect(result).toHaveText('"13.51.5"');

    await typeExpression(page, '2 +');
    await expect(result).toHaveText(
      'Unexpected end of expression (line 1, column 4)',
    );
    await expect(page.locator('.cm-exprit-error')).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test('switches dialects and loads presets', async ({ page }) => {
    await page.goto('/playground/');
    await page.getByRole('button', { name: 'legacy', exact: true }).click();
    await expect(page.locator('.cm-content')).toContainText(
      'isMember and qty >= 3',
    );
    await expect(page.locator('#pg-result')).toHaveText('12.15');

    await page.getByLabel('Example').selectOption('filter-map');
    await expect(
      page.getByRole('button', { name: 'modern', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#pg-result')).toContainText('"book"');

    await page.getByLabel('Example').selectOption('blocked');
    await expect(page.locator('#pg-result')).toHaveText(
      'access to "constructor" is not allowed',
    );

    await page.getByRole('tab', { name: 'Tokens' }).click();
    await expect(page.getByRole('tabpanel')).toContainText('constructor');
    await page.getByRole('tab', { name: 'Printed' }).click();
    await expect(page.getByRole('tabpanel')).toContainText('user.constructor');
  });

  test('restores a shared link', async ({ page }) => {
    const params = new URLSearchParams({
      d: 'legacy',
      e: 'x ^ 2 + y',
      v: JSON.stringify({ x: ['number', '3'], y: ['number', '1'] }),
    });
    await page.goto(`/playground/#${params.toString()}`);
    await expect(page.locator('#pg-result')).toHaveText('10');
    await expect(
      page.getByRole('button', { name: 'legacy', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
  });
});

test('the theme toggle persists without a flash', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.goto('/api/', { waitUntil: 'commit' });
  // The inline head script sets the attribute before any content renders.
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  const background = await page.evaluate(
    () => getComputedStyle(document.body).backgroundColor,
  );
  expect(background).toBe('rgb(247, 248, 244)');
});

test('the navigation collapses on small screens', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'phone only');
  await page.goto('/');
  await page.getByLabel('Menu').click();
  await expect(
    page.getByRole('link', { name: 'Playground' }).first(),
  ).toBeVisible();
});

test('every internal link and anchor in the build resolves', async ({
  isMobile,
}) => {
  test.skip(isMobile, 'runs once');
  const dist = fileURLToPath(new URL('../dist', import.meta.url));
  const entries = await readdir(dist, { recursive: true, withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.html'))
    .map((entry) => join(entry.parentPath, entry.name));

  const pages = new Map<string, string>();
  for (const file of files) {
    const route = `/${relative(dist, file)
      .replace(/index\.html$/, '')
      .replace(/\\/g, '/')}`;
    pages.set(route, await readFile(file, 'utf8'));
  }
  const idsOf = (html: string): Set<string> =>
    new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));

  const broken: string[] = [];
  for (const [route, html] of pages) {
    for (const [, href] of html.matchAll(/\shref="([^"]+)"/g)) {
      if (
        /^(https?:|mailto:)/.test(href) ||
        href.startsWith('/_astro/') ||
        /\.(svg|png|css)$/.test(href)
      ) {
        continue;
      }
      const [path, anchor] = href.split('#');
      const targetRoute =
        path === '' ? route : path.endsWith('/') ? path : `${path}/`;
      const target = pages.get(targetRoute);
      if (!target) {
        broken.push(`${route} → ${href} (no page)`);
      } else if (anchor && !idsOf(target).has(decodeURIComponent(anchor))) {
        broken.push(`${route} → ${href} (no anchor)`);
      }
    }
  }
  expect(broken).toEqual([]);
});

test.describe('scroll spy', () => {
  test.skip(
    ({ viewport }) => (viewport?.width ?? 0) < 1201,
    'the "On this page" list is only shown on wide screens',
  );

  test('highlights the section in view in both navs', async ({ page }) => {
    await page.goto('/getting-started/');
    const tocLinks = page.locator('.docs-toc a[aria-current="location"]');
    const sections = page.locator('.prose h2[id]');
    const target = sections.nth(3);
    const slug = await target.getAttribute('id');

    await target.scrollIntoViewIfNeeded();
    await page.evaluate((id) => {
      document.getElementById(id ?? '')?.scrollIntoView({ block: 'start' });
    }, slug);

    await expect(tocLinks).toHaveCount(1);
    await expect(tocLinks).toHaveAttribute('href', `#${slug}`);
    await expect(
      page.locator(`.docs-sidebar a[href="#${slug}"]`),
    ).toHaveAttribute('aria-current', 'location');
    // The page-level marker is untouched.
    await expect(
      page.locator('.docs-sidebar a[aria-current="page"]'),
    ).toHaveCount(1);
  });

  test('marks the last section at the end of the page', async ({ page }) => {
    await page.goto('/getting-started/');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const last = await page.locator('.docs-toc a').last().getAttribute('href');
    await expect(
      page.locator('.docs-toc a[aria-current="location"]'),
    ).toHaveAttribute('href', last ?? '');
  });
});
