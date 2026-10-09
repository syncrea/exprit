# exprit

**[Documentation](https://exprit.syncrea.ch) · [Getting started](https://exprit.syncrea.ch/getting-started/) · [Playground](https://exprit.syncrea.ch/playground/) · [API reference](https://exprit.syncrea.ch/api/)**

A TypeScript-first, functional-first expression parser: a drop-in
replacement for expr-eval, plus a JavaScript-flavoured dialect. Published
as [`@syncrea/exprit`](packages/exprit/README.md) and
[`@syncrea/exprit-cli`](packages/cli/README.md).

```ts
import { createEnvironment, evaluate, parse } from '@syncrea/exprit';

evaluate(parse('2 ^ x + 1'), { x: 3 }); // 9 (expr-eval syntax)

const modern = createEnvironment({ dialect: 'modern' });
evaluate(parse('xs.filter(x => x > 1)', modern), { xs: [1, 2, 3] }); // [2, 3]
```

## Repository

An [Nx](https://nx.dev) monorepo with pnpm. One pipeline, two front ends:

```
string → tokenizer → tokens → parser-legacy | parser-modern → AST → evaluator → value
                                                      registry ↗ (injected)
```

| Package                  | Role                                                                       |
| ------------------------ | -------------------------------------------------------------------------- |
| `packages/core`          | AST, evaluator, compiler, transforms, sandboxed member access              |
| `packages/tokenizer`     | Configurable scanner with one config per dialect                           |
| `packages/parser-legacy` | expr-eval syntax (Pratt parser) and its `toString` printer                 |
| `packages/parser-modern` | JavaScript expression syntax (Pratt parser) and printer                    |
| `packages/registry`      | Operators, functions, constants, safe globals                              |
| `packages/exprit`        | Published: functional API, `CompatParser` drop-in, `/core` building blocks |
| `packages/cli`           | Published: the `exprit` command                                            |
| `apps/docs`              | The documentation website, [exprit.syncrea.ch](https://exprit.syncrea.ch)  |

## Development

```sh
pnpm install
pnpm check         # lint, typecheck, test, build, expr-eval conformance
pnpm conformance   # expr-eval's own test suite against the legacy dialect
pnpm nx test core  # a single project
```

## Documentation website

[exprit.syncrea.ch](https://exprit.syncrea.ch) is built from `apps/docs`: an
Astro site with a guide, an API reference generated from the TSDoc comments,
and a playground that runs the real engine in the browser. It needs Node.js
22.12 or newer.

```sh
pnpm nx dev docs     # local dev server
pnpm nx build docs   # static site in apps/docs/dist (generates the API reference first)
pnpm nx e2e docs     # build, then Playwright smoke tests
```

It deploys to GitHub Pages from `main` (`.github/workflows/docs.yml`). See
[apps/docs/README.md](apps/docs/README.md).

## Documentation

- [Architecture](docs/architecture.md): pipeline, AST, registry, security model, build
- **Security:** what the sandbox guarantees and what the host must guarantee
  (resource limits, running untrusted input out-of-process) are in the
  [package README's Security section](packages/exprit/README.md#security)
- [Dialects](docs/dialects.md): syntax reference for legacy and modern, and the design decisions
- [Differences from expr-eval](docs/differences-from-expr-eval.md)
- [TypeScript guidelines](docs/typescript.md)
- [AGENTS.md](AGENTS.md): working rules and playbooks for AI agents (and humans)

## License

MIT
