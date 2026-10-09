# exprit docs site

The website at [exprit.syncrea.ch](https://exprit.syncrea.ch): a landing page,
a getting-started guide, a generated API reference and a live playground. It
is an [Astro](https://astro.build) project with static output; the only
JavaScript it ships is the interactive islands, which run the real
`@syncrea/exprit` engine in the browser.

Requires Node.js 22.12 or newer (Astro 7).

## Commands

Run everything through Nx from the repository root:

| Goal                                     | Command                                        |
| ---------------------------------------- | ---------------------------------------------- |
| Dev server on http://localhost:4321      | `pnpm nx dev docs`                             |
| Static build into `apps/docs/dist`       | `pnpm nx build docs`                           |
| Lint / typecheck (`astro-check`)         | `pnpm nx lint docs` / `pnpm nx typecheck docs` |
| Smoke tests (Playwright, builds first)   | `pnpm nx e2e docs`                             |
| Serve the build like GitHub Pages        | `pnpm nx preview docs`                         |
| Regenerate the API reference only        | `pnpm nx api-docs docs`                        |
| Re-render `public/og.png` and touch icon | `pnpm nx og-image docs`                        |

The smoke tests need Chromium once: `pnpm --dir apps/docs exec playwright install chromium`.

## How it fits together

| Path                            | What it is                                                                                      |
| ------------------------------- | ----------------------------------------------------------------------------------------------- |
| `src/pages/index.astro`         | Landing page (hero demo, features, mini playground)                                             |
| `src/guide/getting-started.mdx` | The guide, rendered by `src/pages/getting-started.astro`                                        |
| `src/pages/api/[...slug].astro` | The API reference: renders the generated Markdown in the docs layout                            |
| `src/pages/playground.astro`    | The playground                                                                                  |
| `src/scripts/`                  | Islands as vanilla TypeScript custom elements: `exprit-live`, `exprit-playground`, theme toggle |
| `src/lib/`                      | Engine helpers, presets, AST/token inspection, variable parsing, share links                    |
| `src/styles/`                   | Design tokens (`tokens.css`), global and prose styles, the CSS-variable Shiki theme             |
| `scripts/api-docs.mjs`          | Runs TypeDoc + typedoc-plugin-markdown per entry point into `.generated/api`                    |
| `scripts/bundle-size.mjs`       | Measures the minified + gzipped library build shown on the landing page                         |
| `scripts/og-image.mjs`          | Renders the social card from the design with headless Chromium                                  |
| `e2e/`                          | Playwright smoke tests and a small static server that mimics GitHub Pages                       |

- **API reference.** `docs:api-docs` runs TypeDoc once for
  `packages/exprit/src/index.ts` (`/api/`) and once for `src/core.ts`
  (`/api/core/`), so each page documents its module completely. The script
  adds front matter and rewrites `.md` links to site routes; Astro loads the
  result as the `api` content collection. Sections come from the `@group`
  tags in the TSDoc, ordered by `groupOrder` in `typedoc.json`. To improve the
  reference, improve the comments in the library.
- **Islands.** Build-time rendering computes every initial result with the
  same engine, so pages show correct values before any script runs. The
  playground editor is CodeMirror 6, highlighted with exprit's own tokenizer
  from `@syncrea/exprit/core`.
- **Theme.** Dark by default; light when the visitor prefers it or picks it.
  An inline script in `BaseLayout.astro` applies a stored choice before the
  first paint, so there is no flash.
- **Fonts.** Geist and Geist Mono are self-hosted via `@fontsource`.

## Deployment

`.github/workflows/docs.yml` builds and smoke-tests the site on every pull
request and push, and deploys `main` to GitHub Pages. `public/CNAME` sets the
custom domain. One-time setup in the repository: Settings → Pages → Source
"GitHub Actions", custom domain `exprit.syncrea.ch`, and a DNS `CNAME` record
for `exprit.syncrea.ch` pointing to `<owner>.github.io`.

The repository URL is not public yet, so GitHub links are hidden: set
`repositoryUrl` in `src/lib/site.ts` to show them.
