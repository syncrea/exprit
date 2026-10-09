# @syncrea/exprit

**[Documentation](https://exprit.syncrea.ch) · [Getting started](https://exprit.syncrea.ch/getting-started/) · [Playground](https://exprit.syncrea.ch/playground/) · [API reference](https://exprit.syncrea.ch/api/)**

A TypeScript-first, functional-first expression parser and evaluator. It is a
**drop-in replacement for [expr-eval](https://github.com/silentmatt/expr-eval)**,
and it adds a second dialect that reads like JavaScript.

- **Functional and immutable:** frozen environments and expressions, pure
  functions, and your variables are never modified.
- **Drop-in:** expr-eval's class API is still there. exprit passes
  expr-eval's own test suite.
- **Safe:** no `eval`, no `new Function`, no prototype access. Expressions
  only see what you hand them, and on-by-default resource limits blunt
  denial-of-service. See [Security](#security).
- **Two dialects, one core:** `legacy` (expr-eval syntax) and `modern` (the
  expression grammar of JavaScript) parse to the same typed AST.
- **Fully typed, zero dependencies,** ESM and CommonJS.

```sh
npm install @syncrea/exprit
```

## Usage

```ts
import { createEnvironment, parse, evaluate } from '@syncrea/exprit';

const env = createEnvironment({ dialect: 'modern' });

evaluate(parse('items.filter(i => i.price > 10).map(i => i.name)', env), {
  items: [
    { name: 'pen', price: 2 },
    { name: 'book', price: 12 },
  ],
}); // ['book']

evaluate(parse('user?.address?.city ?? "unknown"', env), { user: {} }); // 'unknown'
```

`parse(source, env)` returns a frozen `ParsedExpression`. Every other function
takes one and returns a value or a new expression:

| Function                              | Returns                                                                |
| ------------------------------------- | ---------------------------------------------------------------------- |
| `evaluate(expr, variables?)`          | the result; `variables` is only read                                   |
| `evaluateWithState(expr, variables?)` | `{ value, variables }`, with legacy assignments in a new frozen object |
| `compile(expr)`                       | a function `(variables?) => result` for hot paths                      |
| `simplify(expr, values?)`             | a new expression with constants folded and values inlined              |
| `substitute(expr, name, replacement)` | a new expression with a variable replaced                              |
| `variables(expr)` / `symbols(expr)`   | the names the expression reads                                         |
| `print(expr)`                         | the expression as source text                                          |
| `toFunction(expr, params, values?)`   | a plain function of the given parameters                               |

### Environments

An environment holds the dialect, functions, constants and options. It is
frozen; `extend` derives a new one.

```ts
import {
  createEnvironment,
  extend,
  parse,
  evaluate,
  compile,
} from '@syncrea/exprit';

const env = createEnvironment({
  dialect: 'modern',
  functions: { double: (n: number) => n * 2 },
});
const withVat = extend(env, { consts: { VAT: 0.25 } });

const price = compile(parse('double(base) * (1 + VAT)', withVat));
price({ base: 100 }); // 250
```

Without an environment, `parse` uses the legacy dialect with expr-eval's
built-ins (`DEFAULT_ENVIRONMENT`).

## The modern dialect

Everything you know from JavaScript expressions works: `&&`, `||`, `??`,
`===`, `?:`, `**`, optional chaining, spread, array and object literals, arrow
functions, template literals, and non-mutating methods on strings, arrays and
numbers. A frozen `Math`, `Number` and `JSON` are available as well.
Assignment, statements, `new` and prototype access are not part of it. See
[Pick a dialect](https://exprit.syncrea.ch/getting-started/#pick-a-dialect)
in the docs, or try both in the
[playground](https://exprit.syncrea.ch/playground/).

## Migrating from expr-eval

Change the import and everything keeps working:

```diff
- import { Parser } from 'expr-eval';
+ import { Parser } from '@syncrea/exprit';
```

`Parser` is a deprecated alias of `CompatParser`, the class-based
compatibility layer over the functional API. It keeps expr-eval's behaviour
exactly, including mutable `parser.functions` tables and assignments that
write into your values object. `require('@syncrea/exprit').Parser` and the
default export work too. Then move to the functional API at your own pace:

| expr-eval / `CompatParser`            | Functional API                                       |
| ------------------------------------- | ---------------------------------------------------- |
| `new Parser(options)`                 | `createEnvironment(options)`                         |
| `parser.functions.f = fn`             | `extend(env, { functions: { f: fn } })`              |
| `parser.parse(s)`                     | `parse(s, env)`                                      |
| `expr.evaluate(values)`               | `evaluate(expr, values)` or `evaluateWithState`      |
| `expr.simplify(v)`, `expr.toString()` | `simplify(expr, v)`, `print(expr)`                   |
| `expr.toJSFunction('x,y')`            | `toFunction(expr, ['x', 'y'])`                       |
| `compatExpr.toParsedExpression()`     | bridges a `CompatExpression` into the functional API |

The few deliberate differences from expr-eval, all of them security fixes or
bug fixes, are listed under
[Deliberate differences](https://exprit.syncrea.ch/getting-started/#deliberate-differences).

## Security

exprit interprets a whitelisted AST; it never generates or runs code.

**What the sandbox guarantees:**

- No code generation. No `eval`, no `new Function`, no `with`; even
  `toJSFunction`/`toFunction` return a closure over the AST, not source.
- No prototype access. `__proto__`, `prototype`, `constructor`, `caller`,
  `callee`, `arguments` and the `__define*`/`__lookup*` accessors are rejected
  as identifiers, members, keys and parameters. `Object.prototype` is never
  polluted, including through object spread.
- Own data only. Member access returns own properties, string
  `length`/indices and the non-mutating methods in `DEFAULT_SAFE_METHODS`.
  Functions are opaque except the registry's own namespaces.
- Your inputs are never mutated. Methods are non-mutating; the functional API
  copies variables before evaluating.
- A function read from an object the expression itself built is called with no
  receiver, so an expression cannot pick the `this` of a host method.
- **Resource limits are on by default.** `maxStringLength`, `maxArrayLength`,
  `maxObjectKeys`, `maxDepth`, `maxSourceLength` and a `maxSteps` budget turn
  the sharpest denial-of-service vectors (an unbounded `repeat`/`padStart`,
  deep nesting) into a catchable `ExpressionLimitError` or
  `ExpressionSyntaxError`. Tune them per environment; `Infinity` disables one.

  ```ts
  createEnvironment({ dialect: 'modern', limits: { maxStringLength: 100_000 } });
  ```

**What it cannot do — the host's responsibility:**

- It cannot cap the memory or wall-clock time of the host process the way an
  operating system can. **Run untrusted evaluation in a worker thread or a
  separate process with a hard memory cap (`--max-old-space-size`) and a kill
  timer.** The in-library limits reduce, but do not replace, that need.
- What you hand in is reachable and callable. Any function you pass as a
  variable or register can be called with arbitrary arguments, and coercing it
  to a string yields `[Function]` rather than its source — but do not pass live
  privileged objects (`process`, `req`, DB handles), objects whose methods trust
  `this`, or objects with side-effecting getters (reading a member runs the
  getter).
- Results and `print()`/`toString()` output are attacker-influenced. Treat them
  as untrusted when writing to a terminal (the CLI escapes control characters),
  embedding in HTML, or re-parsing.
- The static `Parser.parse`/`Parser.evaluate` helpers share one process-wide,
  mutable parser. For multi-tenant use, build a per-tenant `new CompatParser()`
  or `createEnvironment`.

## Low-level building blocks

`@syncrea/exprit/core` exports what the functional API is built from: both
parsers and printers, the tokenizer, AST types, registries, and AST-level
`evaluate`, `compile` and transforms. Use it for custom registries, AST
tooling or a dialect of your own.

```ts
import {
  parseModern,
  evaluate,
  createModernRegistry,
} from '@syncrea/exprit/core';

evaluate(parseModern('a + b'), createModernRegistry(), { a: 1, b: 2 }); // 3
```

## License

MIT
