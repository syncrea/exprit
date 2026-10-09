import { createLegacyRegistry, createLegacyTables } from './legacy';
import { MODERN_GLOBALS } from './globals';
import { createModernRegistry } from './modern';

describe('createLegacyRegistry', () => {
  it('resolves functions before unary operators before variables', () => {
    const tables = createLegacyTables();
    const registry = createLegacyRegistry(tables);
    const scope = { variables: { min: 'shadowed', sqrt: 'shadowed', x: 1 } };
    expect(registry.resolveIdentifier('min', scope)).toEqual({
      found: true,
      value: tables.functions['min'],
    });
    expect(registry.resolveIdentifier('sqrt', scope)).toEqual({
      found: true,
      value: Math.sqrt,
    });
    expect(registry.resolveIdentifier('x', scope)).toEqual({
      found: true,
      value: 1,
    });
  });

  it('skips disabled unary operators and treats undefined values as missing', () => {
    const registry = createLegacyRegistry(
      createLegacyTables(),
      (op) => op !== 'sqrt',
    );
    expect(registry.resolveIdentifier('sqrt', { variables: {} }).found).toBe(
      false,
    );
    expect(
      registry.resolveIdentifier('x', { variables: { x: undefined } }),
    ).toEqual({
      found: false,
      message: 'undefined variable: x',
    });
  });

  it('only reads own variables', () => {
    const registry = createLegacyRegistry();
    expect(
      registry.resolveIdentifier('toString', { variables: {} }).found,
    ).toBe(false);
  });
});

describe('createModernRegistry', () => {
  it('resolves locals, variables, consts, functions, then globals', () => {
    const registry = createModernRegistry({
      consts: { k: 'const' },
      functions: { f: () => 'fn' },
    });
    expect(
      registry.resolveIdentifier('a', {
        variables: { a: 'var' },
        locals: { a: 'local' },
      }),
    ).toEqual({
      found: true,
      value: 'local',
    });
    expect(registry.resolveIdentifier('k', { variables: {} })).toEqual({
      found: true,
      value: 'const',
    });
    expect(registry.resolveIdentifier('Math', { variables: {} })).toEqual({
      found: true,
      value: MODERN_GLOBALS['Math'],
    });
    expect(registry.resolveIdentifier('process', { variables: {} }).found).toBe(
      false,
    );
  });

  it('exposes frozen copies of globals, not the built-ins', () => {
    expect(MODERN_GLOBALS['Math']).not.toBe(Math);
    expect(Object.isFrozen(MODERN_GLOBALS['Math'])).toBe(true);
    expect(Object.isFrozen(MODERN_GLOBALS['Number'])).toBe(true);
  });
});

describe('legacyFunctions', () => {
  it('exposes every function of the module, frozen', async () => {
    const { legacyFunctions } = await import('../index');
    const module = await import('./legacy-functions');
    expect(Object.keys(legacyFunctions).sort()).toEqual(
      Object.keys(module).sort(),
    );
    expect(Object.isFrozen(legacyFunctions)).toBe(true);
  });
});
