---
name: extend-grammar
description: Add or change syntax in exprit's legacy or modern dialect, including new AST node types. Use when adding an operator with its own syntax, a literal form, a keyword, or anything that touches a Pratt parser, the AST, the evaluator or a printer.
---

# Extend a dialect's grammar

Precedence is data in both parsers. Most changes are a table entry plus one
`nud` (prefix) or `led` (infix) case.

## 1. Decide where it belongs

- **Legacy** (`packages/parser-legacy/src/lib/parse.ts`) must stay
  expr-eval-compatible. New legacy syntax is only allowed if every existing
  expr-eval expression keeps its meaning. Run the conformance suite to prove it.
- **Modern** (`packages/parser-modern/src/lib/parse.ts`) follows JavaScript.
  If JavaScript has the construct, copy its precedence and semantics exactly.
  If JavaScript does not, it does not belong in the modern dialect.
- Purely lexical changes (a new punctuator, number format or escape) go into
  `packages/tokenizer/src/lib/config.ts`, not the scanner.

## 2. Pick the AST shape

Reuse an existing node when the semantics fit:

- An eager operator becomes `Binary`/`Unary` with a **registry key**. Add its
  implementation to the dialect's tables in `packages/registry` (see the
  `add-builtin` skill).
- Short-circuiting or control flow needs its own node, like `Logical`,
  `Conditional` or `Chain`.

## 3. Adding a new node type

Add it to the `ExpressionNode` union in `packages/core/src/lib/ast.ts`, then
run `pnpm nx run-many -t typecheck`. Every exhaustive `switch` that misses the
node fails to compile. Handle each one:

- [ ] `core/src/lib/evaluate.ts`: the tree-walking semantics
- [ ] `core/src/lib/compile.ts`: the same semantics as closures. Put shared
      logic into `runtime.ts` instead of duplicating it.
- [ ] `core/src/lib/transform.ts`: `mapChildren` (simplify and substitute)
      and `linearize` (symbol order)
- [ ] `parser-legacy/src/lib/print.ts` and `parser-modern/src/lib/print.ts`

## 4. Security check

If the node reads properties, calls functions, binds names or builds objects:

- Property reads go through `readMember`. Never index user values directly.
- Names that are bound or written go through `assertAllowedName`.
- Add hostile cases to `packages/exprit/src/lib/security.spec.ts`.
- Run the `sandbox-reviewer` subagent on the diff.

## 5. Tests and docs

- Parser tests: precedence and error cases in the parser's `parse.spec.ts`.
  Assert on the printed form, which is the most readable check.
- Semantics: `core/src/lib/evaluate.spec.ts`. Its `both()` helper checks that
  `evaluate` and `compile` agree.
- End to end: `packages/exprit/src/lib/api.spec.ts`.
- Update `docs/dialects.md`, the precedence table or the reference section.
- `pnpm check` must pass, including conformance.
