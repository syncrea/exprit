/**
 * Turning what visitors type into variable values, and back. Also the
 * playground's share links, which keep dialect, expression and variables in
 * the URL hash.
 */
import type { Dialect, ExpressionNode } from '@syncrea/exprit';

import { isDialect } from './engine';
import type { VariableType, VariableValue } from './presets';

export const VARIABLE_TYPES: readonly VariableType[] = [
  'number',
  'string',
  'boolean',
  'json',
];

export const VARIABLE_TYPE_LABELS: Readonly<Record<VariableType, string>> = {
  number: 'number',
  string: 'string',
  boolean: 'boolean',
  json: 'JSON',
};

export const isVariableType = (value: unknown): value is VariableType =>
  typeof value === 'string' &&
  (VARIABLE_TYPES as readonly string[]).includes(value);

export type ParsedVariable =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly error: string };

export const parseVariable = ({ type, raw }: VariableValue): ParsedVariable => {
  switch (type) {
    case 'number': {
      const text = raw.trim();
      const value = Number(text);
      return text !== '' && !Number.isNaN(value)
        ? { ok: true, value }
        : { ok: false, error: 'not a number' };
    }
    case 'string':
      return { ok: true, value: raw };
    case 'boolean':
      return { ok: true, value: raw === 'true' };
    case 'json':
      try {
        return { ok: true, value: JSON.parse(raw) };
      } catch (error) {
        return {
          ok: false,
          error:
            error instanceof SyntaxError ? 'invalid JSON' : 'unreadable value',
        };
      }
  }
};

/** A sensible starting value when a new variable appears in the expression. */
export const DEFAULT_VARIABLE: VariableValue = { type: 'number', raw: '0' };

/** Switching type keeps the value where that makes sense. */
export const convertVariable = (
  current: VariableValue,
  type: VariableType,
): VariableValue => {
  if (current.type === type) {
    return current;
  }
  const parsed = parseVariable(current);
  const value = parsed.ok ? parsed.value : undefined;
  switch (type) {
    case 'number':
      return { type, raw: typeof value === 'number' ? String(value) : '0' };
    case 'string':
      return { type, raw: typeof value === 'string' ? value : current.raw };
    case 'boolean':
      return { type, raw: value ? 'true' : 'false' };
    case 'json':
      return {
        type,
        raw: value === undefined ? 'null' : JSON.stringify(value, null, 2),
      };
  }
};

type NodeLike = Readonly<Record<string, unknown>>;

const isNodeLike = (value: unknown): value is NodeLike =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Names a legacy expression defines itself (`x = 1`, `f(a) = ...` and its
 * parameters). The playground does not ask for those as inputs.
 */
export const definedNames = (root: ExpressionNode): ReadonlySet<string> => {
  const names = new Set<string>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isNodeLike(value)) {
      return;
    }
    if (
      value['type'] === 'Assignment' ||
      value['type'] === 'FunctionDefinition'
    ) {
      names.add(String(value['name']));
    }
    if (
      value['type'] === 'FunctionDefinition' &&
      Array.isArray(value['params'])
    ) {
      value['params'].forEach((param) => names.add(String(param)));
    }
    if (value['type'] === 'Literal') {
      return;
    }
    Object.values(value).forEach(visit);
  };
  visit(root);
  return names;
};

export interface ShareState {
  readonly dialect: Dialect;
  readonly source: string;
  readonly variables: Readonly<Record<string, VariableValue>>;
}

const isVariableValue = (value: unknown): value is VariableValue =>
  isNodeLike(value) &&
  isVariableType(value['type']) &&
  typeof value['raw'] === 'string';

/** `#d=modern&e=...&v=...`, readable enough to edit by hand. */
export const encodeShareState = (state: ShareState): string => {
  const params = new URLSearchParams({
    d: state.dialect,
    e: state.source,
    v: JSON.stringify(
      Object.fromEntries(
        Object.entries(state.variables).map(([name, { type, raw }]) => [
          name,
          [type, raw],
        ]),
      ),
    ),
  });
  return params.toString();
};

export const decodeShareState = (hash: string): ShareState | undefined => {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const dialect = params.get('d');
  const source = params.get('e');
  if (!isDialect(dialect) || source === null) {
    return undefined;
  }
  // Collected as entries: Object.fromEntries defines own properties, so even
  // a crafted `__proto__` key cannot change a prototype.
  const entries: [string, VariableValue][] = [];
  try {
    const parsed: unknown = JSON.parse(params.get('v') ?? '{}');
    if (isNodeLike(parsed)) {
      for (const [name, entry] of Object.entries(parsed)) {
        const candidate: unknown = Array.isArray(entry)
          ? { type: entry[0], raw: entry[1] }
          : entry;
        if (isVariableValue(candidate)) {
          entries.push([name, { type: candidate.type, raw: candidate.raw }]);
        }
      }
    }
  } catch (error) {
    console.warn('Ignoring unreadable variables in the share link', error);
  }
  return { dialect, source, variables: Object.fromEntries(entries) };
};
