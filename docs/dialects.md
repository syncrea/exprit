# Dialects

Pick the dialect when you create the parser. A given string always parses the
same way:

```ts
createEnvironment(); // legacy, expr-eval syntax (also the default for parse)
createEnvironment({ dialect: 'modern' }); // the expression grammar of JavaScript
```

## Decisions

The build spec left two questions open. These are the answers exprit ships with:

1. **Modern is a distinct grammar, not a superset of legacy.** It is
   JavaScript's expression grammar minus assignment and side effects. Legacy
   spellings such as `and`, `or`, `not`, `x!` and `2 ^ 3` (power) are not
   accepted, because they would clash with JavaScript (`^` is XOR, `!x` is
   negation). Both dialects share the parser's `functions` table, so custom
   functions work in both.
2. **No edge-case features were dropped.** Every expr-eval test passes. The
   small behavioural differences that remain are listed in
   [differences-from-expr-eval.md](differences-from-expr-eval.md).

## Side by side

| Concept       | Legacy                         | Modern                                               |
| ------------- | ------------------------------ | ---------------------------------------------------- |
| Logic         | `a and b or not c`             | `a && b \|\| !c` (operands, not booleans)            |
| Equality      | `a == b`, `a != b` (strict)    | `a === b`, `a !== b` (`==` is rejected)              |
| Power         | `2 ^ 10`                       | `2 ** 10` (`^` is bitwise XOR)                       |
| Concatenation | `"a" \|\| "b"`, `[1] \|\| [2]` | `"a" + "b"`, `` `a${b}` ``, `[...a, ...b]`           |
| `+`           | always numeric                 | JavaScript `+`                                       |
| Conditional   | `a ? b : c`                    | `a ? b : c`                                          |
| Nullish       | n/a                            | `a ?? b`, `a?.b`, `a?.[i]`, `f?.()`                  |
| Membership    | `x in [1, 2]`                  | `[1, 2].includes(x)`                                 |
| Factorial     | `5!`, `fac(5)`                 | `fac(5)`                                             |
| Math          | `sin x`, `sqrt(2)`, `PI`       | `Math.sin(x)`, `Math.sqrt(2)`, `Math.PI` (also `PI`) |
| Arrays        | `[1, 2]`, `a[0]`, `map(f, a)`  | `[1, 2]`, `a[0]`, `a.map(x => x * 2)`                |
| Objects       | `user.name` (read only)        | `user.name`, `{ a, ...rest, [k]: v }`                |
| Functions     | `f(x) = x * 2; f(3)`           | `(x => x * 2)(3)`                                    |
| Variables     | `x = 3; x * 2` (writes values) | read only, no assignment                             |
| Comments      | `/* ... */`                    | `/* ... */`, `// ...`                                |
| Numbers       | `1.5e3`, `0xff`, `0b101`       | adds `0o17` and `1_000`                              |

## Legacy reference

expr-eval's syntax, reproduced exactly. Precedence from lowest to highest:

| Level           | Operators                                   | Associativity |
| --------------- | ------------------------------------------- | ------------- |
| Sequence        | `;`                                         | n/a           |
| Assignment      | `=`, `f(x) = …`                             | right         |
| Conditional     | `? :`                                       | right         |
| Logical         | `or`, then `and`                            | left          |
| Comparison      | `==` `!=` `<` `<=` `>` `>=` `in`            | left          |
| Additive        | `+` `-` `\|\|`                              | left          |
| Multiplicative  | `*` `/` `%`                                 | left          |
| Prefix          | `-` `+` `not` and named operators (`sin x`) | right         |
| Power           | `^`                                         | right         |
| Postfix         | `!` (factorial)                             | left          |
| Member and call | `.` `[ ]` `( )`                             | left          |

A named operator followed by parentheses binds to that group only:
`sin(x)^2` is `(sin x)^2`, while `sin x^2` is `sin(x^2)`. A named operator
directly before `,`, `)` or the end of input is a function value, as in
`map(sqrt, xs)`.

Built-ins: the unary operators `sin cos tan asin acos atan sinh cosh tanh
asinh acosh atanh sqrt cbrt log log2 ln lg log10 expm1 log1p abs ceil floor
round trunc exp sign length not`; the functions `random fac min max hypot pyt
pow atan2 if gamma roundTo map fold filter indexOf join sum`; the constants
`E PI true false`.

`EnvironmentOptions.operators` (or `ParserOptions.operators` for `CompatParser`) switches operators off, with expr-eval's option
names (`add`, `comparison`, `logical`, `assignment`, `fndef`, `array`, `sin`,
...). `allowMemberAccess: false` rejects `a.b`.

## Modern reference

JavaScript's operator precedence and semantics: `?:`, `??`, `||`, `&&`,
`|`, `^`, `&`, `===`/`!==`, relational, shifts, additive, multiplicative,
`**`, the prefix operators `!` `-` `+` `~` `typeof`, and member access, calls
and optional chaining.

Literals: numbers, strings with JavaScript escapes, template literals,
`true`, `false`, `null`, `undefined`, arrays and objects with spread, and
arrow functions with an expression body.

Names resolve in this order: arrow parameters, the variables you pass, the
parser's `consts`, the parser's `functions`, then these safe globals:
`Math`, `Number` (callable, plus `isInteger`, `parseFloat`, ...), `String`,
`Boolean`, `Array.isArray`, `Object.keys/values/entries/fromEntries`,
`JSON.parse/stringify`, `parseInt`, `parseFloat`, `isNaN`, `isFinite`, `NaN`,
`Infinity`. An unknown name throws `x is not defined`. `typeof x` returns
`'undefined'` instead.

Methods: strings, arrays and numbers expose only their non-mutating methods
(`map`, `filter`, `reduce`, `includes`, `toSorted`, `slice`, `toUpperCase`,
`padStart`, `toFixed`, ...; the full list is `DEFAULT_SAFE_METHODS`).
Mutating methods such as `push` or `sort` do not exist inside expressions.

Rejected with a specific message: assignment, `==`/`!=`, statements and `;`,
`new`, `function`, `this`, `in`, `instanceof`, array holes, block-bodied
arrows, `-a ** b` without parentheses, and `??` mixed with `||`/`&&`
without parentheses.

### Hardening switches in the modern dialect

`allowMemberAccess: false` and `operators` apply to the modern dialect too, by
meaning. With `allowMemberAccess: false`, `a.b`, `a?.b`, `a[i]`, `a?.[i]` and
method calls such as `"x".toUpperCase()` are rejected at parse time with a
`member access is not permitted` error (plain calls and array literals are
still allowed). The `operators` option names map onto the modern operators:
`add` → `+`, `subtract` → `-`, `multiply` → `*`, `divide` → `/`,
`remainder` → `%`, `power` → `**`, `comparison` → `=== !== < <= > >=`,
`logical` → `&& || ! ??`, `conditional` → `?:`, and `array` → array literals
`[...]` and indexing `a[i]`. A disabled operator is rejected at parse time
(`operator "*" is disabled`). Option names with no modern counterpart
(`concatenate`, `factorial`, `in`, `assignment`, `fndef`, and the named
unary operators such as `sin`) are legacy-only and have no effect in modern.
The modern-only operators `& | ^ << >> >>> ~ typeof` are not toggleable.
