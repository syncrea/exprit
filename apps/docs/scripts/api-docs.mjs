/**
 * Generates the API reference from the TSDoc comments of exprit's public entry
 * points. TypeDoc (with typedoc-plugin-markdown) runs once per entry point, so
 * each page documents its module completely. The Markdown is then rewritten
 * for the site: front matter for the Astro content collection, and links
 * pointing at site routes instead of `.md` files.
 *
 * Output: apps/docs/.generated/api/**.md (git-ignored). Run through Nx:
 * `pnpm nx run docs:api-docs`.
 */
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Application } from 'typedoc';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outRoot = join(appRoot, '.generated', 'api');
const tmpRoot = join(appRoot, '.generated', 'typedoc-tmp');

/** One page tree per public entry point. `route` is the site path of its index page. */
const MODULES = [
  {
    entry: '../../packages/exprit/src/index.ts',
    dir: '',
    route: '/api/',
    title: '@syncrea/exprit',
    navTitle: 'Functional API',
    description:
      'Reference for @syncrea/exprit: environments, parse and evaluate, transforms, errors, and the expr-eval compatibility classes.',
    order: 1,
  },
  {
    entry: '../../packages/exprit/src/core.ts',
    dir: 'core',
    route: '/api/core/',
    title: '@syncrea/exprit/core',
    navTitle: 'Core (advanced)',
    description:
      'Reference for @syncrea/exprit/core: the parsers, printers, tokenizer, AST types, registries and AST-level evaluation the functional API is built from.',
    order: 2,
  },
];

const listMarkdown = async (dir) => {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)))
    .map((file) => file.split('\\').join('/'));
};

/**
 * `…/namespaces/legacyFunctions.md` → `namespaces/legacyfunctions`. Site paths
 * are lower case, and TypeDoc may nest namespace pages under the package name.
 */
const pagePath = (file) => {
  const path = file.replace(/\.md$/, '');
  const namespace = /(?:^|\/)namespaces\/([^/]+)$/.exec(path);
  return (namespace ? `namespaces/${namespace[1]}` : path).toLowerCase();
};

const routeOf = (module, file) => {
  const path = pagePath(file).replace(/(^|\/)index$/, '');
  return `${module.route}${path ? `${path}/` : ''}`;
};

/** Rewrites relative `.md` links to absolute site routes, keeping anchors. */
const rewriteLinks = (markdown, module, file) =>
  markdown.replace(
    /\]\((?!https?:|#|\/)([^)\s]+?\.md)(#[^)\s]*)?\)/g,
    (_match, target, anchor = '') => {
      const resolved = posix.normalize(posix.join(posix.dirname(file), target));
      return `](${routeOf(module, resolved)}${anchor})`;
    },
  );

const frontMatter = (fields) =>
  `---\n${Object.entries(fields)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join('\n')}\n---\n\n`;

const generate = async (module) => {
  const tmpDir = join(tmpRoot, module.dir || 'main');
  const app = await Application.bootstrapWithPlugins({
    options: join(appRoot, 'typedoc.json'),
    entryPoints: [join(appRoot, module.entry)],
    out: tmpDir,
  });
  const project = await app.convert();
  if (!project) {
    throw new Error(`TypeDoc could not convert ${module.entry}`);
  }
  await app.generateOutputs(project);
  if (app.logger.hasErrors()) {
    throw new Error(`TypeDoc reported errors for ${module.entry}`);
  }

  for (const file of await listMarkdown(tmpDir)) {
    const source = await readFile(join(tmpDir, file), 'utf8');
    const isIndex = pagePath(file) === 'index';
    const name = file.replace(/\.md$/, '').split('/').at(-1);
    const fields = {
      title: isIndex ? module.title : name,
      navTitle: isIndex ? module.navTitle : name,
      description: isIndex ? module.description : `${name} in ${module.title}.`,
      module: module.title,
      route: routeOf(module, file),
      order: isIndex ? module.order : module.order + 0.5,
    };
    const target = join(outRoot, module.dir, `${pagePath(file)}.md`);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(
      target,
      frontMatter(fields) + rewriteLinks(source, module, file),
    );
  }
};

await rm(outRoot, { recursive: true, force: true });
await rm(tmpRoot, { recursive: true, force: true });
for (const module of MODULES) {
  await generate(module);
}
await rm(tmpRoot, { recursive: true, force: true });
console.log(`API reference written to ${relative(process.cwd(), outRoot)}`);
