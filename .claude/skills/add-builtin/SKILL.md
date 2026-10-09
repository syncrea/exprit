---
name: add-builtin
description: Add a built-in operator implementation, function, constant, safe global or whitelisted method to exprit's registry. Use when someone asks for a new function (e.g. clamp), a new constant, a Math/JSON-style global in the modern dialect, or a string/array method that expressions may call.
---

# Add a built-in

Built-ins live in `packages/registry`. The parsers never need to change for a
plain function or constant.

## Where it goes

| Kind                                    | File                                           | Visible in    |
| --------------------------------------- | ---------------------------------------------- | ------------- |
| Function, e.g. `clamp(x,a,b)`           | `legacy.ts` → `createLegacyTables().functions` | both dialects |
| Constant, e.g. `TAU`                    | `legacy.ts` → `consts`                         | both dialects |
| Legacy unary op, e.g. `sin x`           | `legacy.ts` → `unaryOps`                       | legacy        |
| Modern global, e.g. `Date`-free helpers | `modern.ts` → `MODERN_GLOBALS`                 | modern        |
| Method, e.g. `str.at(i)`                | `safe-methods.ts` → `DEFAULT_SAFE_METHODS`     | both dialects |

Function implementations that have to match expr-eval live in
`legacy-functions.ts`. New exprit-only functions go there too, written as
pure, typed arrow functions that take `unknown` arguments and validate them.

## Rules

- **Pure and side-effect free.** No I/O, no time, no global state. `random`
  is the one existing exception, inherited from expr-eval.
- **No mutation.** A function must never mutate its arguments, and a safe
  method must be non-mutating (`toSorted`, never `sort`).
- **Globals are frozen copies.** Use `pick()`/`callableNamespace()` in
  `modern.ts`, never a reference to the real built-in, and never anything that
  returns the real `Function`, `Object.prototype` or `globalThis`
  (`Object.getPrototypeOf`, `Reflect` and `Function` are banned).
- **Legacy names matter.** A new legacy _unary operator_ name becomes a
  reserved word in legacy expressions, so `foo` can no longer be a variable.
  Prefer a function unless operator syntax is the point.
- **Validate inputs** with clear messages, like the existing
  `First argument to map is not a function`.

## Checklist

- [ ] Implementation and table entry
- [ ] Unit test in `packages/registry/src/lib/registry.spec.ts`, or an end-to-end
      test in `packages/exprit/src/lib/api.spec.ts`
- [ ] If it touches globals or methods: a hostile case in `security.spec.ts`,
      and a `sandbox-reviewer` run
- [ ] Listed in `docs/dialects.md` (built-ins list or modern reference)
- [ ] `pnpm check`
