# Security review: exprit

## 1. Summary

- **Scope:** `@syncrea/exprit` and `@syncrea/exprit-cli`, the whole pipeline
  (tokenizer, both parsers, core evaluator/compiler/transforms/member-access,
  registry tables, functional API, `CompatParser`, CLI, packaging).
- **Commit reviewed:** `4086fef1736d825903e4104a1ca08755c60a6fb0` (the initial commit).
- **Date:** 2026-10-09.
- **Method:** source review of `packages/*/src` plus runnable proofs of concept
  against the built bundle (`packages/exprit/dist/index.js` and `index.cjs`),
  exercising `evaluate`, `compile`, `CompatParser.evaluate`/`.compile`, in ESM
  and CJS, in both dialects. PoCs live in
  `/tmp/claude-1001/claude-1000/-home-gion-code-exprit/2bef7eb0-6ac6-4e44-920f-70f3ab71bf80/scratchpad/security/`.

**Overall risk posture.** The core sandbox is strong and holds up well. There is
no code execution, no prototype pollution, and no host-object mutation through
any path I tried; the four previously fixed escapes remain fixed in both
`evaluate` and `compile`, in both ESM and CJS builds, and under every variant I
could construct. The real exposure is not confidentiality/integrity but
**availability and configuration**: a single short expression can crash the Node
process with an uncatchable out-of-memory fault (F1), and the `allowMemberAccess`
and `operators` hardening switches are silently ignored in the modern dialect
(F2). Several lower-severity items concern what the _host_ exposes to
expressions (functions, getters, methods that trust `this`) and need to be
documented as host responsibilities. No finding lets an attacker break out of
the interpreter to reach `Function`, `eval`, `process`, `require`, or a
prototype.

### Findings

| ID  | Title                                                                              | Severity | Likelihood | Component                     | Status                                        |
| --- | ---------------------------------------------------------------------------------- | -------- | ---------- | ----------------------------- | --------------------------------------------- |
| F1  | Uncatchable process crash / memory exhaustion via unbounded string & array methods | High     | High       | registry safe-methods, core   | fixed (`7d18e41`)                             |
| F2  | `allowMemberAccess` and `operators` options silently ignored in modern dialect     | Medium   | Medium     | exprit api / parser-modern    | fixed (`004a55a`)                             |
| F3  | Stack-overflow DoS from deep AST (nesting / long operator chains)                  | Medium   | Medium     | core + api freeze + printers  | fixed (`7d18e41`)                             |
| F4  | Host method receiver substitution (`this` chosen by expression)                    | Medium   | Low        | core evaluate / member-access | fixed (`9b8debb`)                             |
| F5  | Host function source disclosure via `String(f)` / templates / `print(simplify)`    | Low      | Medium     | runtime / printers            | fixed (`79990e7`)                             |
| F6  | Side-effecting host getters fire on member read                                    | Low      | Low        | core member-access            | documented as host responsibility (`fb5c9b8`) |
| F7  | CLI emits raw terminal/ANSI escape sequences from results                          | Low      | Medium     | cli run.ts                    | fixed (`e29fa7c`)                             |
| F8  | Shared singleton behind `Parser.parse` / `Parser.evaluate` static API              | Info     | Low        | compat-parser                 | documented (`fb5c9b8`)                        |
| F9  | Published sourcemaps embed full source; dead `@syncrea/source` condition           | Info     | n/a        | packaging                     | fixed (`fb5c9b8`, see note)                   |
| F10 | `MODERN_GLOBALS` reference the real built-in functions, not copies                 | Info     | n/a        | registry globals / docs       | fixed (docs, `fb5c9b8`)                       |

## 2. Threat model and trust boundaries

**Integrations considered:** a SaaS evaluating customer-written rules/formulas
server-side (Node); browser apps evaluating user input; multi-tenant setups
sharing one environment; hosts passing rich objects (class instances, Maps,
Dates, Buffers, getters, functions, `process`/`req`-like objects) as variables;
hosts registering custom functions; hosts that store and re-parse `print()`
output; the CLI processing piped files.

**Attacker capabilities:** always controls the expression string; sometimes
controls variable names; sometimes variable values or JSON fed into variables.

### What the library guarantees (and, from this review, delivers)

- No code generation anywhere. The evaluator interprets a whitelisted AST; there
  is no `eval`, `new Function`, or `with`. `toJSFunction`/`toFunction` return a
  closure over the AST, not generated source.
- Blocked names (`__proto__`, `prototype`, `constructor`, `caller`, `callee`,
  `arguments`, `__define*`/`__lookup*`) are rejected as identifiers, members,
  computed keys, object keys, spread keys, and arrow / legacy function
  parameters. See `BLOCKED_NAMES` in `packages/core/src/lib/member-access.ts:8`.
- Member access returns only own data properties, string `length`/indices, and
  the non-mutating methods in `DEFAULT_SAFE_METHODS` (bound to their receiver).
  Functions are opaque except the registry's own namespaces (`Number`, ...).
- Modern expressions cannot assign; legacy assignments write only into the
  variables object, and the functional API copies that object first.
- `Object.prototype` is never polluted by any path tested.

### What the host must guarantee (trust boundary the host owns)

These are **not** defended by exprit and must be ensured by the embedding host.
They are the subject of findings F1, F4, F5, F6.

1. **Resource limits.** exprit has no timeout, step budget, output-size cap, or
   recursion-depth limit. A host evaluating untrusted expressions must impose
   its own (worker with a hard memory cap and kill timer). Without that, F1 and
   F3 are reachable.
2. **What you hand in as variables/functions is reachable and callable.** Any
   function passed as a variable or registered as a built-in can be called with
   arbitrary arguments and with a `this` the expression chooses (F4), and its
   source can be read back (F5). Getters on objects you pass will run (F6). Do
   not pass live host objects such as `process`, `req`, DB handles, or objects
   whose methods trust `this` or whose getters have side effects.
3. **Output is attacker-influenced.** Results, and `print()`/`toString()`
   output, may contain attacker-chosen strings. Treat them as untrusted when
   writing to a terminal (F7), embedding in HTML, or re-parsing.

## 3. Findings

### F1 — Uncatchable process crash / memory exhaustion (High)

- **Severity:** High. CVSS-style: AV:N/AC:L/PR:N/UI:N — availability only
  (C:N/I:N/A:H). An unauthenticated expression string takes down the process.
- **Affected API/dialect:** both dialects; `evaluate`, `compile`, `CompatParser`
  (ESM and CJS). No variables required.
- **PoC** (`08b-oom.mjs`, `08c-cpu.mjs`, `06-dos.mjs`):

  ```js
  // Default (legacy) dialect, no variables. Allocates a ~600MB string:
  evaluate(parse('"x".padStart(300000000)')); // returns, length 3e8

  // Then force an uncatchable V8 fatal error (process dies, exit 133):
  evaluate(parse('"x".padStart(300000000).split("")')); // # Fatal JavaScript invalid size error
  ```

  Observed under `node --max-old-space-size=256`:
  `# Fatal error ... Fatal JavaScript invalid size error 300000000` followed by
  `Trace/breakpoint trap (core dumped)`, exit code 133. This is **not** a
  catchable `RangeError`; a surrounding `try/catch` does not save the process.
  `"a".repeat(100000000).split("").length` runs for ~2s and allocates heavily
  before completing; `"x".padStart(500000000)` allocates ~1GB and returns.

- **Impact:** a single short expression crashes a Node server evaluating
  untrusted rules (full denial of service, and in multi-tenant setups a crash
  affecting every tenant on the instance). Also reachable, more slowly, through
  `repeat`, `padStart`/`padEnd`, `concat`, `toSpliced`, `flat`, and `split`,
  none of which are size-bounded.
- **Root cause:** `DEFAULT_SAFE_METHODS` whitelists `repeat`, `padStart`,
  `padEnd`, `split`, `concat`, `toSpliced`, `with`, `flat`, `flatMap`
  (`packages/registry/src/lib/safe-methods.ts:11-72`), and the evaluator imposes
  no resource budget (`packages/core/src/lib/evaluate.ts`,
  `packages/core/src/lib/runtime.ts:callValue`). "Non-mutating" was the whitelist
  criterion; "cannot allocate unbounded memory" was not.
- **Recommended fix (defence in depth):**
  - Primary: document that untrusted evaluation MUST run in a worker/child with
    a hard memory limit and a kill timer (the only robust defence against an
    uncatchable OOM). Add this to a README "Security" section.
  - Secondary, in-library: add an optional output/allocation guard — e.g. wrap
    the size-amplifying methods so they reject when the requested length or the
    receiver length exceeds a configurable `maxOutputLength` (default e.g. 1e7),
    and/or expose an `EnvironmentOptions.limits` with a step budget enforced in
    the evaluator/compiler tree walk.
  - **Test to add** (`security.spec.ts`): assert `repeat`/`padStart`/`split`
    reject or are bounded past the configured limit, e.g.
    `expect(() => modern.evaluate('"x".padStart(1e9)')).toThrow()` once a limit
    exists.

### F2 — `allowMemberAccess` and `operators` ignored in the modern dialect (Medium)

- **Severity:** Medium. A documented hardening switch has no effect, giving a
  false sense of safety (configuration weakness). CVSS-style: the impact depends
  on what the host believed it had disabled.
- **Affected API/dialect:** modern dialect only; all entry points.
- **PoC** (`04-options.mjs`):

  ```js
  const env = createEnvironment({
    dialect: 'modern',
    allowMemberAccess: false,
  });
  evaluate(parse('a.b', env), { a: { b: 5 } }); // => 5  (expected: rejected)
  evaluate(parse('a["b"]', env), { a: { b: 5 } }); // => 5
  evaluate(parse('"x".toUpperCase()', env)); // => 'X'

  const env2 = createEnvironment({
    dialect: 'modern',
    operators: { multiply: false, add: false },
  });
  evaluate(parse('2*3', env2)); // => 6  (expected: disabled)
  evaluate(parse('2+3', env2)); // => 5
  ```

  In the legacy dialect the same options behave correctly (`a.b` and `2*3`
  throw a parse error).

- **Impact:** a host that sets `allowMemberAccess: false` in the modern dialect
  expecting to block property reads (and thus all `DEFAULT_SAFE_METHODS` calls,
  including the F1 amplifiers) still has them fully enabled. `operators` toggles
  are likewise inert in modern.
- **Root cause:** `parse` only threads the options into `parseLegacy`; it calls
  `parseModern(source)` with no grammar argument
  (`packages/exprit/src/lib/api.ts:80-92`), and `parseModern`
  (`packages/parser-modern/src/lib/parse.ts:96`) has no concept of
  `allowMemberAccess` or `operators`. The `docs/dialects.md` modern reference
  does not state that these options are legacy-only.
- **Recommended fix:** either (a) make `parseModern` accept and honour
  `allowMemberAccess` (reject `.`/`[` member and `(` call on member) and the
  relevant operator toggles, or (b) if modern is intentionally not configurable,
  throw from `createEnvironment`/`extend`/`CompatParser` when these options are
  combined with `dialect: 'modern'`, and document it. Silently ignoring a
  security switch is the dangerous outcome.
  - **Test to add:** `expect(() => modern.evaluate('a.b', { a: { b: 1 } })).toThrow()`
    for an `allowMemberAccess: false` modern environment (once honoured), or a
    construction-time throw.

### F3 — Stack-overflow DoS from deep AST (Medium)

- **Severity:** Medium. Catchable (`RangeError`), so the process survives, but
  cheap to trigger and affects parse, evaluate, compile, print, and simplify.
- **Affected API/dialect:** both dialects; all entry points.
- **PoC** (`07-parser-dos.mjs`): with input strings of a few tens of KB —

  ```js
  parse('('.repeat(5000) + '1' + ')'.repeat(5000)); // RangeError (recursion)
  parse('1' + '+1'.repeat(10000)); // RangeError (deep left-assoc AST)
  print(parse('('.repeat(20000) + '1' + ')'.repeat(20000))); // RangeError
  simplify(parse('1' + '+1'.repeat(50000))); // RangeError
  ```

  Long left-associative chains parse iteratively but build a deeply nested AST;
  the stack then overflows in `freezeNode`
  (`packages/exprit/src/lib/api.ts:43`), in `evaluateNode`
  (`packages/core/src/lib/evaluate.ts:81`), in `compileNode`, and in the
  printers, each of which recurses per AST level.

- **Impact:** repeated requests with such inputs spike CPU and throw; if the
  host does not catch, a thrown `RangeError` aborts the current request (and the
  CLI's `runLines` keeps going, which is correct). The main concern is cost and
  the many recursive surfaces rather than a crash.
- **Root cause:** no maximum nesting depth in the parser, and recursive
  tree-walks with no depth guard in freeze/evaluate/compile/print/simplify.
- **Recommended fix:** enforce a configurable maximum input length and a maximum
  AST depth in the parser (fail fast with an `ExpressionSyntaxError`). Document
  the limits. A depth cap in the parser transitively protects the downstream
  recursive walks.
  - **Test to add:** assert `parse` rejects input exceeding the depth/length
    cap with a clear error, in both dialects.

### F4 — Host method receiver substitution (Medium)

- **Severity:** Medium when a host passes objects whose methods trust `this`;
  otherwise low. Integrity of host logic, not a sandbox breakout.
- **Affected API/dialect:** modern dialect; all entry points.
- **PoC** (`02-receiver.mjs`): host passes `account` with methods as own
  properties.

  ```js
  // account.describe() normally returns account.owner ('host'):
  evaluate(parse('account.describe()', env), { account }); // 'host'
  // but the expression can rebind `this` to an object it controls:
  evaluate(parse('({ m: account.describe, owner: "x" }).m()', env), {
    account,
  }); // 'x'
  evaluate(parse('({ g: account.getBalance, balance: 999 }).g()', env), {
    account,
  }); // 999
  ```

- **Impact:** the previously fixed array-callback `thisArg` escape only covers
  array callbacks. By reading a method off a host object (an own-property
  function is returned unbound) and calling it through a literal, the expression
  chooses the receiver. A host method that reads privileged state from `this`
  (`this.balance`, `this.isAdmin`, a method bound in a fluent/builder API) can be
  invoked against an attacker-crafted object. No access to blocked names is
  gained (`__proto__` etc. in the literal are still rejected), and only
  host-exposed methods are reachable.
- **Root cause:** `readMember` returns own-property functions unbound
  (`packages/core/src/lib/member-access.ts:126`), and `evaluateCall` binds the
  receiver to whatever object the member was read from
  (`packages/core/src/lib/evaluate.ts:52-78`;
  `packages/core/src/lib/compile.ts:305-333`). This is normal JavaScript
  semantics, which is why it is a host-responsibility finding rather than a bug.
- **Recommended fix:** primarily documentation — hosts must not expose objects
  whose methods trust `this`; expose plain data or pre-bound/free functions.
  Optionally, consider binding own-property methods to their origin object on
  read (this would change semantics and may break legitimate use, so document
  the trade-off before doing it).
  - **Test to add:** a regression in `security.spec.ts` capturing the
    `({ m: host.method, ... }).m()` receiver-substitution behaviour so any future
    hardening is intentional.

### F5 — Host function source disclosure (Low)

- **Severity:** Low (information disclosure, conditional on the host passing
  functions as data).
- **Affected API/dialect:** both dialects; `String`, template literals (modern),
  and `print(simplify(...))`.
- **PoC** (`11-fnsource.mjs`): host registers `hostFn` or passes it as a
  variable.

  ```js
  evaluate(parse('String(f)', env), { f: hostFn }); // "function hostFn(x){ ... }"
  evaluate(parse('`${f}`', env), { f: hostFn }); // same source text
  print(simplify(parse('x', env), { x: hostFn })); // same source text inlined
  ```

- **Impact:** `Function.prototype.toString` yields the function's full source,
  which may reveal business logic or literals embedded in the source. It does
  **not** disclose closed-over variable _values_ (only the source text), and no
  control flow is gained. Still, a sandbox that advertises isolation leaks host
  code here when functions are passed in.
- **Root cause:** `concatTemplate`/`String` coercion in
  `packages/core/src/lib/runtime.ts:292` and the `String(value)` fallback in the
  printers (`packages/parser-modern/src/lib/print.ts:554`,
  `packages/parser-legacy/src/lib/print.ts:404`). Functions are deliberately
  opaque for member reads, but coercion to string is not intercepted.
- **Recommended fix:** document that passing functions as variables exposes
  their source. Optionally, in `concatTemplate` and the printers, render
  functions as an opaque token (e.g. `[Function]`, as the CLI's `formatResult`
  already does) instead of their source.
  - **Test to add:** assert that template/`String` of a function does not contain
    the function's body once masked.

### F6 — Side-effecting host getters fire on member read (Low)

- **Severity:** Low (host responsibility).
- **PoC** (`05-getters.mjs`):

  ```js
  const cfg = Object.defineProperty({}, 'secret', {
    enumerable: true,
    get() {
      /* side effect */ return process.env.HOME;
    },
  });
  evaluate(parse('cfg.secret', env), { cfg }); // getter runs; returns its value
  ```

- **Impact:** reading a member invokes an own accessor getter, so a host object
  with side-effecting getters will have them triggered by an expression, and any
  value the getter computes (including secrets) is returned. `simplify` can even
  trigger the getter at transform time when it folds a member over an inlined
  literal object.
- **Root cause:** `readMember` returns `object[name]` for own properties
  (`packages/core/src/lib/member-access.ts:126-128`), which runs getters by
  design. `Object.hasOwn` is true for own accessor properties.
- **Recommended fix:** document as host responsibility (do not pass objects with
  side-effecting getters). A stricter option would be to read via
  `Object.getOwnPropertyDescriptor` and return `undefined` for accessor
  properties, but that changes behaviour for legitimate computed properties.

### F7 — CLI emits raw terminal/ANSI escape sequences (Low)

- **Severity:** Low (terminal injection when processing piped/untrusted input).
- **PoC:**

  ```sh
  node packages/cli/dist/main.mjs -d modern '"\u001b[31mRED\u001b[0m"'
  # writes the ESC[31m ... ESC[0m bytes verbatim; the terminal renders red
  ```

- **Impact:** when the CLI prints a string result, it writes `String(value)`
  with no escaping (`formatResult`, `packages/cli/src/lib/run.ts:44-55`). An
  attacker-controlled expression or `--var` value can emit cursor-movement,
  screen-clear, or other control sequences into the operator's terminal,
  enabling spoofed output and (against vulnerable terminals) worse. Relevant when
  the CLI processes untrusted piped files.
- **Root cause:** bare `String(value)` output for string results and the JSON
  path does not strip control characters either.
- **Recommended fix:** when writing to a TTY, escape or strip C0/C1 control
  characters (except `\n`/`\t`) from string results before output. Document that
  CLI output of untrusted expressions may contain control characters.

### F8 — Shared singleton behind the static `Parser` API (Info)

- `CompatParser.parse` / `CompatParser.evaluate` (and the `Parser` alias) use a
  lazily created module-level singleton `shared`
  (`packages/exprit/src/lib/compat-parser.ts:197-212`). An expression cannot
  reach it, but host code that mutates `Parser` instance tables obtained from the
  static API, or that relies on the static API in a multi-tenant process, shares
  one mutable `functions`/`consts`/`unaryOps`/… object across all callers. The
  functional API and each `new CompatParser()` are correctly isolated (fresh
  `createLegacyTables()` per instance, verified). Recommend documenting that the
  static `Parser.parse`/`Parser.evaluate` helpers share state and that
  multi-tenant hosts should construct per-tenant environments.

### F9 — Published sourcemaps embed full source; dead export condition (Info)

- `npm pack` for `@syncrea/exprit` ships `dist/*.map` with populated
  `sourcesContent`, i.e. the complete original TypeScript source is published
  inside the sourcemaps (verified in `dist/index.js.map`). This is not a
  vulnerability for an MIT-licensed project but is often unintended; drop maps
  from the published `files` if that is not desired.
- The `@syncrea/source` export condition points at `./src/index.ts` /
  `./src/core.ts`, but `src` is not in the published `files` list (only `dist`,
  README, LICENSE). Any downstream tool that resolves the `@syncrea/source`
  condition against the published tarball will get a missing path. Harmless in
  practice (the condition is for the workspace) but worth removing from the
  published `exports` or adding `src` to `files`.
- Positives confirmed: **zero runtime dependencies** (`@syncrea/exprit` has none;
  the CLI depends only on `@syncrea/exprit`), and the CI workflow uses
  `permissions: contents: read` (minimal). No publish/token workflow is present
  in-repo; release is manual via `nx release`.

### F10 — `MODERN_GLOBALS` reference the real built-in functions (Info)

- `pick(Math, ...)` and friends build a frozen wrapper object, but its values are
  the **real** global functions (the actual `Math.max`, `JSON` is reimplemented,
  but `Math.*` are the genuine built-ins) — `packages/registry/src/lib/globals.ts:94-136`.
  Because the namespace objects are frozen and modern expressions cannot assign,
  an expression cannot mutate them (verified: `Math.max.x` is opaque/undefined,
  and there is no assignment). So this is safe in practice, but the architecture
  doc's phrasing "frozen copies ... never the real built-ins" is imprecise: the
  _container_ is a frozen copy, the _functions inside it_ are the real ones.
  Recommend correcting the wording. No action needed on the code.

## 4. Hardening recommendations (not vulnerabilities)

1. **Resource governance (addresses F1, F3).** Add an opt-in limits surface to
   `EnvironmentOptions`: `maxOutputLength` (cap on strings/arrays produced by
   `repeat`/`padStart`/`padEnd`/`concat`/`split`/`toSpliced`/`flat`), a step
   budget enforced in the evaluator and compiler tree walks, and a parser
   `maxDepth`/`maxLength`. Even conservative defaults would blunt the sharpest
   DoS without affecting normal formulas.
2. **Run untrusted evaluation out-of-process.** Document that the only robust
   defence against an uncatchable OOM (F1) is a worker/child process with a hard
   `--max-old-space-size`, a wall-clock kill timer, and no ambient privileges.
3. **README "Security" section.** State plainly what exprit guarantees (no code
   gen, no prototype access, own-properties-only, no input mutation) and what the
   host must guarantee: impose resource limits; never pass live privileged
   objects (`process`, `req`, DB handles); do not pass functions or objects whose
   methods trust `this` or whose getters have side effects (F4, F5, F6); treat
   results and `print()` output as untrusted (F7); and note that modern-dialect
   `allowMemberAccess`/`operators` do not apply (until F2 is fixed).
4. **Mask functions in output.** Render functions as `[Function]` in
   `concatTemplate` and the printers (F5), matching the CLI.
5. **Freeze depth and surface-consistency.** Consider converting the deepest
   recursive walks (evaluate/compile/print/freeze) to be depth-guarded or
   iterative for the associative operator chains, so F3 degrades to a clean error
   rather than a near-stack-overflow.
6. **Documentation accuracy.** Fix the two imprecise claims noted below
   (section 10 of the brief): the modern dialect's handling of the security
   options (F2) and the "frozen copies" wording (F10). The exprit package README
   bullet "Safe: no `eval`, no `new Function`, no prototype access" is accurate;
   do not let it imply DoS-safety or that arbitrary host objects are safe to pass.

## 5. Verified-safe (attack classes correctly blocked)

All of the following were run against `evaluate`, `compile`, and `CompatParser`
(`.evaluate`/`.compile`) in **both** ESM and CJS builds; `({}).polluted`/
`isAdmin` were checked clean after every case (`01-regressions.mjs`,
`10-typeconf.mjs`, `09-print.mjs`).

**Prototype pollution / blocked-name reach — all rejected:**

- `({ ...JSON.parse('{"__proto__":{"polluted":1}}') })` → `ExpressionSecurityError`
- `({ ...Object.fromEntries([["__proto__", {polluted:1}]]) })` → rejected
- `({ ...o })` where `o = JSON.parse('{"__proto__":{...}}')` → rejected
- `({ [k]: ... })` with `k = '__proto__'` (runtime-computed key) → rejected
- `({ [{ toString: () => "__proto__" }]: ... })` (coerced computed key) → rejected
- `({ ["__proto__"]: ... })`, `({ "\x5f_proto__": ... })`,
  `x["\u{5f}_proto__"]` (escape-formed blocked names) → rejected
- `({ __proto__ })` shorthand → rejected
- `x.constructor`, `x.__proto__`, `x["constructor"]`, `f.constructor`,
  `[].map.constructor("return process")()`, `Math.constructor`,
  `Number.prototype` → rejected (legacy and modern)
- `constructor`, `__proto__` as bare identifiers → rejected

**Previously fixed escapes — still blocked (both dialects, both builds):**

- `start(() => step.caller.arguments[0])`, `step["call"+"er"]`,
  `step?.caller` → `access to "caller" is not allowed`
- `Object.values(step)` / `Object.keys(step)` on a host function → `[]` / `0`
  (no internals exposed); `step.length` → `undefined`
- legacy `g() = step.caller.arguments[0]; start(g)` via `parser.functions` →
  rejected
- `f(__proto__) = 1`, `constructor(x) = 1`, `f(x, constructor) = 1` → parse error
- `((__proto__) => __proto__)(...)` arrow param → parse error
- `[0].map(account.describe, { owner: "attacker" })` and the same with
  `flatMap` → `thisArg` dropped, receiver stays `undefined` (`['no receiver']`)

**No code generation:**

- `parse('x || "); process.exit(1); ("').toJSFunction('x')('a')` returns the
  string `'a); process.exit(1); ('` — no execution.

**Input mutation:**

- `items.toSorted()` returns a sorted copy; `items.sort()` throws
  `is not a function`; the input array is unchanged.
- The functional `evaluate` copies variables; legacy `x = 1; x` does not mutate
  the caller's object (only `evaluateWithState` / `CompatExpression.evaluate`
  expose assignments, by contract).

**Printer / re-parse injection:**

- Legacy `'a\'; evil'` prints as `"a'; evil"` (JSON-escaped) and round-trips
  stably; modern templates round-trip stably.
- `simplify` inlining an attacker string (`'"); danger'`, ``'`${danger}`'``)
  prints a JSON-escaped string literal that re-parses as the literal, not as new
  syntax — no injection.

**Type confusion in legacy operators:**

- `2 in "123"`, `1 in {length:3,0:1,...}`, `o[1]`, `o[1.9]` behave as array-like
  reads with integer-coerced indices; `a[i]` in legacy coerces the key to an
  int32 (`arrayIndex`), so `a["constructor"]` reads index 0, not a prototype.
- `[1].concat(host)` honours `Symbol.isConcatSpreadable` on a _host-provided_
  object, but an expression cannot set symbol keys, so it cannot craft one
  itself.

**CLI:**

- `--var 'x={"__proto__":{"polluted":1}}'` then `x.polluted` → `undefined`,
  `Object.prototype` clean; blocked-name expressions exit non-zero;
  mixed-validity stdin lines yield exit code 1 with per-line errors.

## 6. Suggested implementation order

1. **F2** — stop silently ignoring `allowMemberAccess`/`operators` in modern
   (honour them, or throw at construction). Cheap, removes a false sense of
   safety, and (if honoured) lets a host disable the F1 amplifiers.
2. **F1** — add `maxOutputLength` (and ideally a step budget) and, in parallel,
   document the out-of-process requirement. Highest real-world impact.
3. **F3** — parser `maxDepth`/`maxLength` (reuses the limits surface from F1).
4. **README Security section + doc fixes** — covers F4, F5, F6, F7, F8, F10 as
   host responsibilities and corrects the imprecise claims. Low effort, high
   clarity.
5. **F5/F7** — mask functions in `concatTemplate`/printers; strip control
   characters in CLI TTY output.
6. **F9** — packaging cleanup (drop sourcemaps from `files` if undesired; remove
   or back the dead `@syncrea/source` condition).

## 7. Remediation (what was done)

All findings were addressed on the security branch. Regression tests live in
`packages/exprit/src/lib/security.spec.ts` (and `packages/cli/src/lib/run.spec.ts`
for F7), covering both `evaluate` and `compile` where relevant. The legacy
dialect remains a drop-in: `pnpm conformance` still passes 478 tests (1 skipped),
against the sources and the built bundle.

- **F1 (`7d18e41`).** Added an on-by-default `limits` surface
  (`EnvironmentOptions.limits`, `ParserOptions.limits`, `Registry.limits`;
  defaults in `packages/core/src/lib/limits.ts`). Size-amplifying string and
  array methods (`repeat`, `padStart`/`padEnd`, `concat`, `split`, `replace`,
  `flat`, `flatMap`, `toSpliced`, `join`), string concatenation (modern `+`,
  legacy `||`), template literals and array/object-literal growth throw a
  catchable `ExpressionLimitError` before allocating. `flat`/`flatMap` are
  reimplemented with a counter so a native call cannot allocate past the limit.
  Defaults: `maxStringLength`/`maxArrayLength` 10,000,000, `maxObjectKeys`
  1,000,000, `maxSteps` 100,000,000. `Infinity` disables a limit. An optional
  step budget is enforced in both `evaluate` and `compile`; measured hot-path
  overhead is within noise (~2–3%).
- **F2 (`004a55a`).** `parseModern` now takes a grammar and honours
  `allowMemberAccess` (rejecting `.`, `?.`, indexing and method calls) and
  `operators` (expr-eval's option names mapped onto the modern operators).
  Disabled constructs are rejected at parse time with an `ExpressionSyntaxError`.
- **F3 (`7d18e41`).** The parsers reject source longer than `maxSourceLength`
  and ASTs deeper than `maxDepth` (both an in-parse recursion guard and a
  post-parse iterative depth check) with an `ExpressionSyntaxError`. This bounds
  every downstream recursive walk (evaluate, compile, printers, transforms,
  `freezeNode`) for any tree the parser accepts.
- **F4 (`9b8debb`).** The evaluator marks objects and arrays it builds itself
  and calls functions read from them with `this` undefined; host-provided
  objects keep their natural receiver.
- **F5 (`79990e7`).** A shared `stringifyValue` renders functions as
  `[Function]` in template concatenation, the modern `String` global, modern
  `+`, legacy `||` and both printers.
- **F6 (documented, `fb5c9b8`).** Left as a host responsibility: reading an own
  accessor property runs the getter by design. The README's Security section
  tells hosts not to pass objects with side-effecting getters. A descriptor-based
  read that returns `undefined` for accessors would break legitimate computed
  properties, so it was not adopted.
- **F7 (`e29fa7c`).** The CLI escapes C0/C1 control characters (except newline
  and tab) as `\xHH` when results go to a TTY; piped output is unchanged.
- **F8 (documented, `fb5c9b8`).** TSDoc on the static `Parser.parse`/`evaluate`
  and the README note that they share one process-wide mutable parser and that
  multi-tenant hosts should use a per-tenant instance. No code change: an
  expression cannot reach the singleton.
- **F9 (`fb5c9b8`).** Sourcemaps are dropped from both published tarballs via a
  negated `files` pattern (`"!dist/**/*.map"`), verified with `npm pack
--dry-run`. The `@syncrea/source` export condition is intentionally retained:
  `tsconfig.base.json` sets `customConditions: ["@syncrea/source"]`, so the
  workspace (docs, CLI typecheck) resolves `@syncrea/exprit` to its TypeScript
  sources through it. It is harmless in the tarball because no external consumer
  requests that condition and `src` is not shipped.
- **F10 (docs, `fb5c9b8`).** `docs/architecture.md` now states that the modern
  global namespaces are frozen container copies whose functions are the genuine
  built-ins, which an expression can neither replace nor mutate. No code change.

### Follow-ups from the post-fix sandbox review

A second adversarial review of the fixes found more gaps. These were fixed:
`Object.fromEntries` as a receiver carrier; double conversion of guard arguments
(a `valueOf` hook could report a small size to the guard and a large one to the
native call) in `padStart`/`padEnd`/`concat`/`join`/`split`; functions stored
under coercion-hook keys (`toString`, `valueOf`, `toJSON`, `toLocaleString`) of
built objects, which JavaScript calls implicitly with the object as `this`;
unmarked `Object.entries` pairs; unguarded `normalize`/case conversion and
legacy `join`; a `split("")` off-by-one that rejected a legitimate maximum-size
split; `a?.[i]` not gated by `operators.array`; and a false positive that
rejected `f?.()` under `allowMemberAccess: false`.

**Still open (known residuals):**

- **No total allocation budget.** Limits apply per value. Many values each
  just under the limit (`xs.map(() => "a".repeat(9999999).split(""))`), or
  `Object.entries`/`Object.keys` of a 10M-element array (10M pair arrays or
  index strings), can still exhaust the heap. `JSON.stringify` has no size
  guard and can expand a value with shared references. These need a cumulative
  allocation budget, and they are why the README requires running untrusted
  input in a worker or process with a memory cap.
- **Some sizes are checked only after the string is built:** template and `+`
  with array operands, legacy `||` with arrays, `replace` with a function or
  `` $` `` replacement, and nested arrays inside `join`/`concat`. In testing these
  failed with a catchable error, not a crash.
- **Function source through arrays (F5):** `` `${[f]}` ``, `[f].join()`,
  `String([f])` and legacy `join(",", [f])` still use the native
  `Array.prototype.join`, which prints the function source. Only a function at
  the top level is masked.
- **Runtime recursion** (`f(n) = f(n-1)`, `(f => f(f))(f => f(f))`) still ends in
  a catchable `RangeError`, not an `ExpressionLimitError`. A call-depth limit
  would close this.
- **Ownership marking is process-wide.** An object returned by `evaluate`,
  given a method by the host and passed back in, is still treated as
  expression-built, so that method runs with `this` undefined. This is safe,
  but surprising.
- `operators.add: false` does not disable template literals or `.concat`.
