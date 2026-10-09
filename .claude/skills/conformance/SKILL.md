---
name: conformance
description: Run, triage and maintain the expr-eval conformance suite that proves exprit is a drop-in replacement. Use when conformance fails, when deciding whether a behaviour change is acceptable, when documenting a deliberate difference from expr-eval, or when updating the vendored expr-eval tests.
---

# expr-eval conformance

`packages/exprit/conformance/expr-eval/*.test.js` is expr-eval's own mocha
suite, vendored unchanged except for converting `require` to `import`. It
imports `Parser` from the alias `conformance-target`, which
`vitest.conformance.config.mts` points at one of:

| `CONFORMANCE_TARGET` | Target                                | Use                                            |
| -------------------- | ------------------------------------- | ---------------------------------------------- |
| unset (`src`)        | exprit's TypeScript sources           | day-to-day: `pnpm conformance`                 |
| `dist`               | the built bundle (`pnpm build` first) | proves the published package; CI runs this too |
| `expr-eval`          | expr-eval 2.0.2 itself                | baseline: shows what expr-eval itself does     |

## Triage a failure

1. Run the baseline on the same test:
   `CONFORMANCE_TARGET=expr-eval pnpm --dir packages/exprit exec vitest run --config vitest.conformance.config.mts -t "<test name>"`.
   If expr-eval fails it too, the test is wrong or targets unreleased expr-eval
   behaviour. Discuss before changing anything.
2. If expr-eval passes, exprit regressed. Fix exprit. Legacy `toString()`
   output must match byte for byte (`parser-legacy/src/lib/print.ts`), and
   symbol order comes from `linearize` in `core/src/lib/transform.ts`.
3. Never edit the vendored test files to make a test pass. Settings deny that
   edit on purpose.

## Accepting a deliberate difference

Only for security fixes or clear expr-eval bugs, and only with the user's agreement:

1. Add the full test name (`describe` titles and `it` title joined by `>`)
   to `KNOWN_DELTAS` in `packages/exprit/conformance/known-deltas.ts`, with a
   one-line reason. The setup file then registers that test with `it.fails`,
   so the suite goes red again if the test starts passing.
2. Document it in `docs/differences-from-expr-eval.md`, including what users
   who relied on the old behaviour should do.

`SUITE_QUIRKS` is only for tests that cannot run under vitest at all; they are
skipped for every target.

## Updating the vendored suite

```sh
curl -sL https://codeload.github.com/silentmatt/expr-eval/tar.gz/refs/heads/master | tar xz -C /tmp
node tools/scripts/vendor-expr-eval-tests.mjs /tmp/expr-eval-master
pnpm conformance
```

Review the diff of the vendored files, then run the baseline. New expr-eval
features that are not in the published release fail the baseline too.
