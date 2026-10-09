# Differences from expr-eval

exprit's legacy dialect passes expr-eval's own test suite: 478 of 479 tests
pass, and the remaining one is a mocha-only test that vitest cannot run (see
`SUITE_QUIRKS`). The suite runs against both the sources and the published
bundle in CI.

The behaviour below differs on purpose. Almost all of it closes a security
hole or fixes a bug in expr-eval. Each item says what to do if you relied on
the old behaviour.

## Safer by design

| expr-eval 2.0.2                                                                                                      | exprit                                                                                                                                                                                  | If you relied on it                                       |
| -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Variables are read with `values[name]`, so inherited names such as `toString` resolve to `Object.prototype` methods. | Only own properties of the values object are variables.                                                                                                                                 | Pass the values as own properties.                        |
| `a.b` reads any property, including inherited ones and functions such as `x.constructor`.                            | Only own properties, string `length` and indices, and non-mutating methods from `DEFAULT_SAFE_METHODS`.                                                                                 | Expose the data you need as own properties.               |
| Prototype access is blocked by a regex on variable names only (`/^__proto__\|prototype\|constructor$/`).             | `__proto__`, `prototype`, `constructor`, `caller`, `callee`, `arguments` and `__define*`/`__lookup*` are blocked as names, members and keys. A name such as `myconstructor` is allowed. | Nothing; only exact blocked names are rejected.           |
| `toJSFunction` generates JavaScript source and compiles it with `new Function`.                                      | `toJSFunction` returns a closure over the simplified AST. No code is generated.                                                                                                         | Results are the same; legacy semantics apply (see below). |
| Constants and operator words are looked up with `in`, so `toString` counts as a constant.                            | Own properties only.                                                                                                                                                                    | Nothing.                                                  |

## Bug fixes and small deltas

- **`toJSFunction` semantics.** expr-eval's generated code used JavaScript
  operators, so `+` concatenated strings there but added numbers in
  `evaluate`. exprit uses the same semantics in both (`+` is numeric).
- **Member assignment** (`a.b = 1`) silently corrupted the evaluation stack
  in expr-eval. exprit rejects it with `expected variable for assignment`.
- **Function definitions** must use plain names as parameters (`f(x, y) = …`).
- **String literals** handle an escaped backslash before the closing quote
  (`'a\\'`) correctly. expr-eval treated that quote as escaped.
- **Array literals** need commas. expr-eval accepted `[1 2]`.
- **Chaining after calls** such as `f(x).y` and `f(x)[0]` is accepted.
  expr-eval rejected it.
- **Error messages** keep the `parse error [line:column]:` prefix. The text
  after it is clearer and sometimes different (`Unexpected end of
expression` instead of `unexpected TEOF: EOF`). Unknown characters are
  reported before later syntax errors, because tokenizing happens up front.
- **Negative zero** is normalised to `0` in the final result, as in expr-eval,
  but not in intermediate results of lazily evaluated branches.
- **`sum(array)`** is included. It exists on expr-eval's master branch but not
  in the published 2.0.2.

## Typings

- `evaluate` returns `EvaluationResult` (an alias of `any`), so code written
  against expr-eval's `number`/`any` signatures keeps compiling.
- `Value` also includes `boolean`, `null`, `undefined` and arrays.
- `Parser` and `Expression` are deprecated aliases of `CompatParser` and
  `CompatExpression`. They point users to the functional API, but behave
  exactly like expr-eval's classes.
- `CompatParser` additionally exposes `dialect` and `toEnvironment()`;
  `CompatExpression` adds `ast`, `compile()` and `toParsedExpression()`.
