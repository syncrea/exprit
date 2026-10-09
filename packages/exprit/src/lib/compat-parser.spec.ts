import * as api from './api';
import { CompatParser as Parser } from './compat-parser';

describe('CompatParser', () => {
  it('compiles to a closure that matches evaluate', () => {
    const parser = new Parser();
    const expression = parser.parse(
      'x ^ 2 + sin(y) * fac(3) + (z > 1 ? 10 : 20)',
    );
    const compiled = expression.compile();
    for (const values of [
      { x: 1, y: 0, z: 0 },
      { x: -3, y: Math.PI / 2, z: 5 },
    ]) {
      expect(compiled(values)).toBe(expression.evaluate(values));
    }
  });

  it('keeps the parser tables per instance', () => {
    const a = new Parser();
    const b = new Parser();
    a.functions['only'] = () => 1;
    expect(a.evaluate('only()')).toBe(1);
    expect(() => b.evaluate('only()')).toThrow(/undefined variable: only/);
  });

  it('writes legacy assignments into the given values object', () => {
    const values: Record<string, unknown> = {};
    expect(new Parser().evaluate('x = 4; x * 2', values)).toBe(8);
    expect(values['x']).toBe(4);
  });

  it('sees functions registered after parsing, as expr-eval does', () => {
    const parser = new Parser();
    const expression = parser.parse('later(2)');
    parser.functions['later'] = (n: number) => n * 3;
    expect(expression.evaluate()).toBe(6);
  });

  it('hands its expressions to the functional API', () => {
    const parser = new Parser();
    parser.consts['K'] = 10;
    const parsed = parser.parse('K * x').toParsedExpression();
    expect(api.evaluate(parsed, { x: 2 })).toBe(20);
    expect(Object.isFrozen(parsed.env.consts)).toBe(true);
  });
});
