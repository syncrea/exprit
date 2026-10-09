/**
 * Any callable an expression may invoke. `never[]` parameters let functions with
 * concrete signatures such as `Math.sin` be registered without casts.
 */
import type { Limits } from './limits';

export type ExpressionFunction = (...args: never[]) => unknown;

/** Variables visible to an evaluation. Legacy assignments write into this object. */
export type Variables = Record<string, unknown>;

export interface Scope {
  readonly variables: Variables;
  /** Arrow-function parameters, innermost binding wins. */
  readonly locals?: Readonly<Record<string, unknown>>;
}

export type Resolution =
  | { readonly found: true; readonly value: unknown }
  | { readonly found: false; readonly message: string };

/** Decides what an identifier means. Each dialect has its own lookup order. */
export type IdentifierResolver = (name: string, scope: Scope) => Resolution;

/** Prototype methods an expression may call on primitive values and arrays, and readable namespaces. */
export interface SafeMethods {
  readonly array: readonly string[];
  readonly string: readonly string[];
  readonly number: readonly string[];
  /** Callable globals built by the registry whose own members may be read, e.g. `Number`. */
  readonly namespaces: ReadonlySet<object>;
}

/**
 * Everything the evaluator needs besides the AST. It is always passed in and
 * never mutated by exprit, which keeps custom functions and sandboxing explicit.
 */
export interface Registry {
  readonly unaryOps: Readonly<Record<string, ExpressionFunction>>;
  readonly binaryOps: Readonly<Record<string, ExpressionFunction>>;
  readonly functions: Readonly<Record<string, ExpressionFunction>>;
  readonly consts: Readonly<Record<string, unknown>>;
  readonly methods: SafeMethods;
  readonly resolveIdentifier: IdentifierResolver;
  /** Resource limits enforced while evaluating. */
  readonly limits: Limits;
}
