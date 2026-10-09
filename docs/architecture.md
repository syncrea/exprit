# Architecture

exprit is one pipeline with two front ends. Both dialects parse into the same
AST, so the evaluator, the registry and every transform are shared. All
dialect differences live in the tokenizer configuration, the parser and the
registry.

```
            ┌──────────────────────── registry (injected) ────────────────────────┐
            │  unaryOps · binaryOps · functions · consts · safe methods · resolver │
            └──────────────┬─────────────────────────────────────┬────────────────┘
                           │ (legacy: operator words, consts)    │
string ──► tokenizer ──► tokens ──► parser-legacy | parser-modern ──► AST ──► evaluate ──► value
            (config per dialect)        (Pratt)                       │    └─► compile ──► closure
                                                                      ├─► simplify / substitute
                                                                      ├─► collectSymbols
                                                                      └─► printLegacy | printModern
```

## Stages

### Tokenizer (`packages/tokenizer`)

A single scanner driven by a `TokenizerConfig`: punctuators (longest match
first), comment styles, number formats, quote characters, escape rules and
template literals. It emits plain lexemes (`number`, `string`, `identifier`,
`punctuator`, `template`, `eof`) with source offsets. It never decides whether
`sin` is an operator or `PI` a constant; that is the parser's job.

Tokenization is eager, so an unknown character is reported before any syntax
error that comes after it.

### Parsers (`packages/parser-legacy`, `packages/parser-modern`)

Both are Pratt (top-down operator precedence) parsers. Precedence is data: a
binding-power table. Adding an infix operator is one table entry plus a `led`
case when it needs special handling.

- **Legacy** classifies identifiers using the parser's live tables, exactly as
  expr-eval does: enabled operator words (`and`, `sin`, ...) become
  operators, `consts` become literals at parse time, everything else is a
  variable name. Disabled operators (`operators` option) become parse errors
  or plain names, again matching expr-eval.
- **Modern** implements JavaScript's precedence table, arrow functions,
  optional chaining (wrapped in a `Chain` node so a nullish link
  short-circuits the whole chain), spread, object and array literals, and
  template literals. Unsupported JavaScript gets a specific error rather than
  a generic one: assignment, `==`, statements, `new`, mixing `??` with `||`,
  and unparenthesised `-a ** b`.

Each parser package also exports a printer. `printLegacy` reproduces expr-eval's
`toString()` exactly, including its extra parentheses around lazily evaluated
operands. `printModern` prints fully parenthesised modern source.

### AST (`packages/core/src/lib/ast.ts`)

A discriminated union of immutable nodes. Operator nodes store the
operator's **registry key** (`'+'`, `'and'`, `'**'`), not a fixed meaning,
which is why legacy `+` (numeric) and modern `+` (JavaScript) can share
`BinaryNode`. Short-circuiting and control flow get their own node types
(`Logical`, `Conditional`, `Chain`) because they cannot be eager registry
functions. The legacy-only constructs `Assignment`, `FunctionDefinition` and
`Sequence` are plain nodes too.

### Registry (`packages/registry`, interface in `core`)

Everything the evaluator needs besides the tree:

| Field               | Legacy                                | Modern                                                       |
| ------------------- | ------------------------------------- | ------------------------------------------------------------ |
| `unaryOps`          | expr-eval's (`-`, `not`, `sin`, `!`)  | JavaScript's (`-`, `+`, `!`, `~`, `typeof`)                  |
| `binaryOps`         | expr-eval's (`+` numeric, `^` power)  | JavaScript's (`+` concat-or-add, `^` xor, `**`)              |
| `functions`         | the parser's `functions` table        | the same table                                               |
| `consts`            | inlined at parse time                 | looked up at evaluation                                      |
| `resolveIdentifier` | functions → unary ops → own variables | arrow params → variables → consts → functions → safe globals |
| `methods`           | `DEFAULT_SAFE_METHODS`                | `DEFAULT_SAFE_METHODS`                                       |

The registry is always passed in, never global. The public API builds one from
a frozen `Environment` on each call. `CompatParser` snapshots its mutable
tables into an environment every time, so `parser.functions.f = ...` keeps
working as it did in expr-eval.

### Evaluator and compiler (`packages/core`)

`evaluate(ast, registry, variables)` is a plain tree walk. `compile(ast,
registry)` walks the tree once and returns a closure for hot paths. Both share
`runtime.ts` for the semantics of every operation, so they cannot drift apart.
`evaluate.spec.ts` checks that they agree.

### Transforms (`packages/core/src/lib/transform.ts`)

`simplify` folds unary, binary and member expressions over literals, the same
set expr-eval folds. `substitute` replaces free variables. `collectSymbols`
linearises the AST into expr-eval's postfix order, because
`symbols({ withMembers: true })` reports member chains in that order and the
conformance suite checks it.

## Public API

`packages/exprit` exposes three layers:

1. **Functional API** (`src/lib/api.ts`, `src/lib/environment.ts`). An
   `Environment` (dialect, tables, options) and a `ParsedExpression` (AST plus
   environment) are deeply frozen values. `evaluate` copies the variables
   before evaluating, so legacy assignments never leak into the caller's
   object; `evaluateWithState` returns them as a new frozen object instead.
2. **`CompatParser` / `CompatExpression`** (`src/lib/compat-parser.ts`).
   expr-eval's class API with mutable tables and in-place assignment,
   implemented by delegating to (1). It is exported as `Parser`/`Expression`
   too, marked deprecated, so a changed import is all a migration needs.
3. **`@syncrea/exprit/core`** (`src/core.ts`): the building blocks below,
   for custom registries and AST tooling.

## Security model

An expression can only do what the AST and the registry allow:

- **No code generation.** Not even `toJSFunction`, which returns a closure
  over the simplified AST.
- **Blocked names.** `__proto__`, `prototype`, `constructor`, `caller`,
  `callee`, `arguments` and the `__define*`/`__lookup*` accessors are
  rejected as identifiers, member names, object keys, and arrow or legacy
  function parameters.
- **Own properties only.** `readMember` returns own properties of objects
  and arrays. Strings expose only `length` and indices. Functions are opaque
  (no `caller`, `arguments`, `name`), except the namespaces the registry
  builds itself, such as `Number`. Inherited members are invisible unless they
  are listed in `SafeMethods`. That list is frozen, contains only non-mutating
  methods bound to their receiver, and drops the `thisArg` of array
  callbacks, so an expression cannot choose the `this` of a host function.
- **Spread is copied key by key.** Object spread goes through the same
  blocked-name check as literal keys, so an own `__proto__` key from
  `JSON.parse` cannot set a prototype.
- **Frozen global namespaces.** The modern dialect sees frozen container
  objects (`Math`, `Number`, `JSON`, ...), never the real global objects. The
  functions inside them are the genuine built-ins (for example the real
  `Math.max`), but because the containers are frozen and modern expressions
  cannot assign, an expression can neither replace nor mutate them, and a
  function's own members stay opaque (`Math.max.constructor` is rejected).
  `JSON` is reimplemented so its methods take only safe arguments.
- **No mutation of inputs.** Modern expressions cannot assign. Legacy `x = 1`
  writes only into the variables object the caller passed in, as expr-eval
  does.
- **No chosen receiver.** A function read from an object or array the evaluator
  built itself (a literal or a spread) is called with `this` undefined, so an
  expression cannot invoke a host method against an object it crafted. Objects
  the host passes in keep their natural receiver.
- **Resource limits, on by default.** `EnvironmentOptions.limits` (defaults in
  `core/src/lib/limits.ts`) bound the size of produced strings, arrays and
  objects, the parser's accepted depth and source length, and an evaluation
  step budget. Size-amplifying methods and operators throw a catchable
  `ExpressionLimitError` before they allocate; the parser rejects over-deep or
  over-long input with an `ExpressionSyntaxError`, which bounds every recursive
  tree walk downstream. These cannot cap host process memory or wall time; run
  untrusted evaluation out-of-process as well (see the package README).

## Package layout and build

Only `@syncrea/exprit` and `@syncrea/exprit-cli` are published. The five
internal libraries are private workspace packages that export their
TypeScript sources. Each is linted, typechecked and tested on its own.
`tsdown` bundles them into `@syncrea/exprit` as ESM and CommonJS, each with a
single bundled `.d.ts`. That is why `enforceBuildableLibDependency` is off in
the ESLint config. Versions are lockstep through `nx release`.
