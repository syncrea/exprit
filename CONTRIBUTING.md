# Contributing to exprit

Thanks for helping. Bug reports, migration questions and pull requests are all
welcome. For anything security-related, please follow [SECURITY.md](SECURITY.md)
instead of opening an issue.

## Setup

You need Node.js 22.12 or newer and pnpm (the version is pinned in
`package.json`; `corepack enable` picks it up).

```sh
pnpm install
pnpm check          # lint, typecheck, test, build and the expr-eval conformance suite
pnpm docs:dev       # the documentation site at http://localhost:4321
```

The repository is an Nx monorepo. [AGENTS.md](AGENTS.md) maps the packages and
lists the commands for single projects, and
[docs/architecture.md](docs/architecture.md) explains the pipeline.

## Pull requests

- **Keep the drop-in promise.** The legacy dialect must keep passing
  expr-eval's own test suite (`pnpm conformance`). A deliberate difference
  needs a reason and an entry in
  [docs/differences-from-expr-eval.md](docs/differences-from-expr-eval.md).
- **Add tests** in the package that owns the behaviour. Anything that touches
  the sandbox (member access, calls, the registry, globals, limits) also gets a
  case in `packages/exprit/src/lib/security.spec.ts`.
- **Follow the code style** in [docs/typescript.md](docs/typescript.md):
  functional, immutable, named exports. Lint enforces most of it, and
  `pnpm format` runs Prettier.
- **Update the docs** that describe what you changed: the package README, the
  docs site in `apps/docs`, and the TSDoc comments the API reference is
  generated from.
- **Use conventional commit messages** (`feat:`, `fix:`, `docs:`, ...). They
  drive the version bump and the changelog.

## Releases (maintainers)

Releases run in the **Release** GitHub Actions workflow: the whole `nx release`
(version from the conventional commits, `CHANGELOG.md`, commit, tag, push,
GitHub release, npm publish with provenance). Every green CI run on `main`
starts a Release run that waits for approval; approve it to release that
commit, or start the workflow manually to choose the version or do a dry run.
Preview locally with `pnpm nx release --dry-run --yes`.
