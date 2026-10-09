/**
 * `@syncrea/exprit/core`: the low-level building blocks under the functional
 * API, for advanced use such as custom registries, AST tooling or a dialect of
 * your own. Everything here works on plain AST nodes and explicit registries.
 */
export * from '@exprit/core';
export {
  parseLegacy,
  printLegacy,
  type LegacyGrammar,
} from '@exprit/parser-legacy';
export { parseModern, printModern } from '@exprit/parser-modern';
export {
  LEGACY_TOKENIZER_CONFIG,
  MODERN_TOKENIZER_CONFIG,
  tokenize,
  type TokenizerConfig,
} from '@exprit/tokenizer';
export {
  createLegacyRegistry,
  createLegacyTables,
  createModernRegistry,
  DEFAULT_SAFE_METHODS,
  GLOBAL_NAMESPACES,
  legacyFunctions,
  MODERN_BINARY_OPS,
  MODERN_GLOBALS,
  MODERN_UNARY_OPS,
  type LegacyTables,
  type ModernTables,
} from '@exprit/registry';
export { createRegistry } from './lib/environment';
