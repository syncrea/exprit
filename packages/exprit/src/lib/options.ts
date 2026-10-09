/**
 * The two syntaxes exprit understands. `legacy` is expr-eval's syntax
 * (`and`, `or`, `^` for power); `modern` is the expression grammar of
 * JavaScript (`&&`, `??`, `**`, arrow functions, optional chaining).
 *
 * @group Environments
 */
export type Dialect = 'legacy' | 'modern';

/**
 * expr-eval's operator switches for the legacy dialect. Every operator is
 * enabled unless set to `false`.
 *
 * @example
 * ```typescript
 * createEnvironment({ operators: { assignment: false, fndef: false } });
 * ```
 *
 * @group Environments
 */
export interface OperatorOptions {
  readonly add?: boolean;
  readonly comparison?: boolean;
  readonly concatenate?: boolean;
  readonly conditional?: boolean;
  readonly divide?: boolean;
  readonly factorial?: boolean;
  readonly logical?: boolean;
  readonly multiply?: boolean;
  readonly power?: boolean;
  readonly remainder?: boolean;
  readonly subtract?: boolean;
  readonly sin?: boolean;
  readonly cos?: boolean;
  readonly tan?: boolean;
  readonly asin?: boolean;
  readonly acos?: boolean;
  readonly atan?: boolean;
  readonly sinh?: boolean;
  readonly cosh?: boolean;
  readonly tanh?: boolean;
  readonly asinh?: boolean;
  readonly acosh?: boolean;
  readonly atanh?: boolean;
  readonly sqrt?: boolean;
  readonly log?: boolean;
  readonly ln?: boolean;
  readonly lg?: boolean;
  readonly log10?: boolean;
  readonly abs?: boolean;
  readonly ceil?: boolean;
  readonly floor?: boolean;
  readonly round?: boolean;
  readonly trunc?: boolean;
  readonly exp?: boolean;
  readonly length?: boolean;
  readonly in?: boolean;
  readonly random?: boolean;
  readonly min?: boolean;
  readonly max?: boolean;
  readonly assignment?: boolean;
  readonly fndef?: boolean;
  readonly cbrt?: boolean;
  readonly expm1?: boolean;
  readonly log1p?: boolean;
  readonly sign?: boolean;
  readonly log2?: boolean;
  readonly array?: boolean;
  readonly [operator: string]: boolean | undefined;
}

/**
 * Options for `new CompatParser(options)`, the same shape as expr-eval's
 * `Parser` options plus `dialect`.
 *
 * @group expr-eval compatibility
 */
export interface ParserOptions {
  /**
   * Which syntax to accept. `legacy` (the default) is expr-eval's syntax;
   * `modern` is the expression grammar of JavaScript.
   */
  readonly dialect?: Dialect;
  /** Allow `a.b` member access. Defaults to `true`. */
  readonly allowMemberAccess?: boolean;
  /** Legacy dialect only: switch individual operators off. */
  readonly operators?: OperatorOptions;
}

/** expr-eval groups several operator symbols under one option name. */
const OPTION_NAMES: Readonly<Record<string, string>> = {
  '+': 'add',
  '-': 'subtract',
  '*': 'multiply',
  '/': 'divide',
  '%': 'remainder',
  '^': 'power',
  '!': 'factorial',
  '<': 'comparison',
  '>': 'comparison',
  '<=': 'comparison',
  '>=': 'comparison',
  '==': 'comparison',
  '!=': 'comparison',
  '||': 'concatenate',
  and: 'logical',
  or: 'logical',
  not: 'logical',
  '?': 'conditional',
  ':': 'conditional',
  '=': 'assignment',
  '[': 'array',
  '()=': 'fndef',
};

export const isOperatorEnabled = (
  operators: OperatorOptions | undefined,
  operator: string,
): boolean => {
  const optionName = Object.hasOwn(OPTION_NAMES, operator)
    ? OPTION_NAMES[operator]
    : operator;
  return (
    !operators ||
    !Object.hasOwn(operators, optionName) ||
    Boolean(operators[optionName])
  );
};
