/**
 * Playground presets. Each one shows a real feature of a dialect; the
 * expected results in the comments come from running them through exprit.
 */
import type { Dialect } from '@syncrea/exprit';

export type VariableType = 'number' | 'string' | 'boolean' | 'json';

export interface VariableValue {
  readonly type: VariableType;
  /** The value as typed in the variable panel (JSON text for `json`). */
  readonly raw: string;
}

export type PresetGroup = 'both' | 'modern' | 'legacy' | 'safety';

export interface Preset {
  readonly id: string;
  readonly label: string;
  readonly group: PresetGroup;
  /** One sentence on what the preset demonstrates. */
  readonly note: string;
  /** The expression per dialect. A preset that only exists in one dialect switches to it. */
  readonly sources: Readonly<Partial<Record<Dialect, string>>>;
  readonly variables: Readonly<Record<string, VariableValue>>;
}

export const PRESET_GROUP_LABELS: Readonly<Record<PresetGroup, string>> = {
  both: 'Both dialects',
  modern: 'Modern dialect',
  legacy: 'Legacy dialect (expr-eval)',
  safety: 'Errors and the sandbox',
};

const num = (raw: string): VariableValue => ({ type: 'number', raw });
const str = (raw: string): VariableValue => ({ type: 'string', raw });
const bool = (raw: 'true' | 'false'): VariableValue => ({
  type: 'boolean',
  raw,
});
const json = (raw: string): VariableValue => ({ type: 'json', raw });

export const PRESETS: readonly Preset[] = [
  {
    id: 'cart-total',
    label: 'Cart total',
    group: 'both',
    note: 'A pricing rule with a member discount. Same logic, both spellings.',
    sources: {
      modern: 'isMember && qty >= 3\n  ? price * qty * 0.9\n  : price * qty',
      legacy: 'isMember and qty >= 3\n  ? price * qty * 0.9\n  : price * qty',
    },
    variables: { price: num('4.5'), qty: num('3'), isMember: bool('true') },
  },
  {
    id: 'eligibility',
    label: 'Eligibility rule',
    group: 'both',
    note: 'Reads nested values with member access.',
    sources: {
      modern: 'user.age >= 18 && !user.banned',
      legacy: 'user.age >= 18 and not user.banned',
    },
    variables: { user: json('{ "age": 21, "banned": false }') },
  },
  {
    id: 'shipping',
    label: 'Shipping tiers',
    group: 'both',
    note: 'Nested conditionals read the same in both dialects.',
    sources: {
      modern: 'weight > 20 ? 25 : weight > 5 ? 12 : 5',
      legacy: 'weight > 20 ? 25 : weight > 5 ? 12 : 5',
    },
    variables: { weight: num('8') },
  },
  {
    id: 'interest',
    label: 'Compound interest',
    group: 'both',
    note: 'Power is ^ in legacy and ** in modern, where ^ is bitwise XOR.',
    sources: {
      modern: 'Math.round(principal * (1 + rate) ** years)',
      legacy: 'round(principal * (1 + rate) ^ years)',
    },
    variables: { principal: num('1000'), rate: num('0.05'), years: num('10') },
  },
  {
    id: 'clamp',
    label: 'Clamp a score',
    group: 'both',
    note: 'Built-in functions such as min and max work in both dialects.',
    sources: {
      modern: 'max(0, min(100, score * 1.2))',
      legacy: 'max(0, min(100, score * 1.2))',
    },
    variables: { score: num('70') },
  },
  {
    id: 'optional-chaining',
    label: 'Optional chaining',
    group: 'modern',
    note: 'A missing link short-circuits the chain; ?? supplies a default.',
    sources: { modern: 'user?.address?.city ?? "unknown"' },
    variables: { user: json('{ "name": "Ada" }') },
  },
  {
    id: 'filter-map',
    label: 'Filter and map',
    group: 'modern',
    note: 'Arrow functions and the non-mutating array methods.',
    sources: { modern: 'items.filter(i => i.price > 10).map(i => i.name)' },
    variables: {
      items: json(
        '[\n  { "name": "pen", "price": 2 },\n  { "name": "book", "price": 12 },\n  { "name": "lamp", "price": 30 }\n]',
      ),
    },
  },
  {
    id: 'template',
    label: 'Template literal',
    group: 'modern',
    note: 'Template literals with safe string methods.',
    sources: { modern: '`Hello, ${name.trim().toUpperCase()}!`' },
    variables: { name: str('  ada ') },
  },
  {
    id: 'spread',
    label: 'Object spread',
    group: 'modern',
    note: 'Builds a new object; the input is never modified.',
    sources: { modern: '({ ...user, age: user.age + 1 })' },
    variables: { user: json('{ "name": "Ada", "age": 36 }') },
  },
  {
    id: 'average',
    label: 'Average with reduce',
    group: 'modern',
    note: 'reduce with an arrow function and a start value.',
    sources: {
      modern: 'scores.reduce((sum, s) => sum + s, 0) / scores.length',
    },
    variables: { scores: json('[72, 88, 95]') },
  },
  {
    id: 'globals',
    label: 'Math and spread arguments',
    group: 'modern',
    note: 'A frozen copy of Math is available as a safe global.',
    sources: { modern: 'Math.max(...scores) - Math.min(...scores)' },
    variables: { scores: json('[72, 88, 95]') },
  },
  {
    id: 'named-operators',
    label: 'Named operators and factorial',
    group: 'legacy',
    note: 'expr-eval syntax: prefix operators without parentheses, and x!.',
    sources: { legacy: 'sqrt 16 + 5! / fac(3)' },
    variables: {},
  },
  {
    id: 'membership',
    label: 'Membership with in',
    group: 'legacy',
    note: 'The legacy in operator tests array membership.',
    sources: { legacy: 'role in ["admin", "editor"]' },
    variables: { role: str('editor') },
  },
  {
    id: 'concatenation',
    label: 'String concatenation',
    group: 'legacy',
    note: 'In legacy, || concatenates and + is always numeric.',
    sources: { legacy: '"Hello, " || name || "!"' },
    variables: { name: str('Ada') },
  },
  {
    id: 'constants',
    label: 'Constants and roundTo',
    group: 'legacy',
    note: 'PI is inlined at parse time, as in expr-eval.',
    sources: { legacy: 'roundTo(PI * r ^ 2, 2)' },
    variables: { r: num('3') },
  },
  {
    id: 'assignments',
    label: 'Assignments and sequences',
    group: 'legacy',
    note: 'Legacy assignments live in a copy of the variables; yours stay untouched.',
    sources: {
      legacy: 'total = price * qty;\ntotal > 10 ? total * 0.9 : total',
    },
    variables: { price: num('4.5'), qty: num('3') },
  },
  {
    id: 'blocked',
    label: 'Blocked: prototype access',
    group: 'safety',
    note: 'The sandbox rejects constructor, __proto__ and prototype everywhere.',
    sources: { modern: 'user.constructor' },
    variables: { user: json('{ "name": "Ada" }') },
  },
  {
    id: 'loose-equality',
    label: 'Rejected: loose equality',
    group: 'safety',
    note: 'Unsupported JavaScript gets a specific error with its position.',
    sources: { modern: 'qty == 3' },
    variables: { qty: num('3') },
  },
  {
    id: 'mixed-nullish',
    label: 'Rejected: ?? mixed with ||',
    group: 'safety',
    note: 'Like JavaScript, mixing ?? with || needs parentheses.',
    sources: { modern: 'discount ?? fallback || 0' },
    variables: { discount: num('5'), fallback: num('2') },
  },
];

export const presetById = (id: string): Preset | undefined =>
  PRESETS.find((preset) => preset.id === id);

/** The query parameters that select a preset: `?example=<id>[&dialect=legacy]`. */
export interface ExampleSelection {
  readonly preset: Preset;
  readonly dialect?: Dialect;
}

const EXAMPLE_PARAM = 'example';
const DIALECT_PARAM = 'dialect';

/** Reads the preset selected by a URL's query string, if any and if it exists. */
export const readExampleSelection = (
  search: string,
): ExampleSelection | undefined => {
  const params = new URLSearchParams(search);
  const preset = presetById(params.get(EXAMPLE_PARAM) ?? '');
  if (!preset) {
    return undefined;
  }
  const dialect = params.get(DIALECT_PARAM);
  return dialect === 'legacy' || dialect === 'modern'
    ? { preset, dialect }
    : { preset };
};

/**
 * Returns `url` with the example parameters set to the selected preset, or
 * removed when there is none. Other parameters are kept; `modern` is the
 * default dialect, so only `legacy` is written.
 */
export const withExampleSelection = (
  url: URL,
  presetId: string | undefined,
  dialect: Dialect,
): URL => {
  const next = new URL(url);
  if (presetId) {
    next.searchParams.set(EXAMPLE_PARAM, presetId);
  } else {
    next.searchParams.delete(EXAMPLE_PARAM);
  }
  if (presetId && dialect === 'legacy') {
    next.searchParams.set(DIALECT_PARAM, dialect);
  } else {
    next.searchParams.delete(DIALECT_PARAM);
  }
  return next;
};
