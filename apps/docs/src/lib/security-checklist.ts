/**
 * The landing page's security checklist. Every row is backed by regression
 * tests; CWE and OWASP references were checked against the CWE lists OWASP
 * publishes for each Top 10:2025 category (top10.owasp.org/2025/).
 */
import { SITE } from './site';

export type CheckStatus = 'blocked' | 'bounded' | 'escaped' | 'none';

export interface OwaspCategory {
  readonly id: string;
  readonly name: string;
  readonly href: string;
}

export interface SecurityCheck {
  readonly risk: string;
  /** One sentence; `backticks` mark code. */
  readonly how: string;
  readonly status: CheckStatus;
  /** CWE ids without the `CWE-` prefix. */
  readonly cwes: readonly number[];
  /** Absent when the risk maps to no OWASP Top 10:2025 category. */
  readonly owasp?: OwaspCategory;
  /** Path of the tests that prove the row, relative to the repository root. */
  readonly proof: string;
}

const OWASP_BASE = 'https://top10.owasp.org/2025/';

const owasp = (id: string, name: string, slug: string): OwaspCategory => ({
  id,
  name,
  href: `${OWASP_BASE}${slug}/`,
});

const INJECTION = owasp('A05:2025', 'Injection', 'A05_2025-Injection');
const INTEGRITY = owasp(
  'A08:2025',
  'Software or Data Integrity Failures',
  'A08_2025-Software_or_Data_Integrity_Failures',
);
const EXCEPTIONS = owasp(
  'A10:2025',
  'Mishandling of Exceptional Conditions',
  'A10_2025-Mishandling_of_Exceptional_Conditions',
);
const SUPPLY_CHAIN = owasp(
  'A03:2025',
  'Software Supply Chain Failures',
  'A03_2025-Software_Supply_Chain_Failures',
);

const SECURITY_TESTS = 'packages/exprit/src/lib/security.spec.ts';

export const SECURITY_CHECKS: readonly SecurityCheck[] = [
  {
    risk: 'Code injection',
    how: 'No `eval`, no `new Function`, no generated code, not even in `toJSFunction`. Expressions are parsed into a whitelisted syntax tree and interpreted.',
    status: 'blocked',
    cwes: [94, 95, 917],
    owasp: INJECTION,
    proof: SECURITY_TESTS,
  },
  {
    risk: 'Sandbox escape',
    how: '`__proto__`, `prototype`, `constructor`, `caller` and `arguments` are rejected as names, members and keys. Only own properties of the data you pass in are visible.',
    status: 'blocked',
    cwes: [470],
    owasp: INJECTION,
    proof: SECURITY_TESTS,
  },
  {
    risk: 'Prototype pollution',
    how: 'Object literals and spreads are copied key by key through the same checks, so a `__proto__` key from JSON stays plain data.',
    status: 'blocked',
    cwes: [1321, 915],
    owasp: INTEGRITY,
    proof: SECURITY_TESTS,
  },
  {
    risk: 'Host method hijacking',
    how: 'An expression cannot pick the `this` of your functions: methods read from objects it built run without a receiver, and `thisArg` is dropped.',
    status: 'blocked',
    cwes: [],
    proof: SECURITY_TESTS,
  },
  {
    risk: 'Resource exhaustion',
    how: 'Default limits on string, array and object size, nesting depth, source length and evaluation steps turn the known crash paths into catchable errors.',
    status: 'bounded',
    cwes: [400, 770, 674],
    proof: SECURITY_TESTS,
  },
  {
    risk: 'Information disclosure',
    how: 'Inherited members stay invisible, and your functions print as `[Function]` instead of their source code.',
    status: 'blocked',
    cwes: [200],
    proof: SECURITY_TESTS,
  },
  {
    risk: 'Unhandled failures',
    how: 'Failures throw catchable errors, with their own types for syntax, security and limit violations. Nothing fails open.',
    status: 'blocked',
    cwes: [755],
    owasp: EXCEPTIONS,
    proof: SECURITY_TESTS,
  },
  {
    risk: 'Terminal escape injection',
    how: 'The CLI escapes control characters in results written to a terminal.',
    status: 'escaped',
    cwes: [150, 116],
    owasp: INJECTION,
    proof: 'packages/cli/src/lib/run.spec.ts',
  },
  {
    risk: 'Vulnerable dependencies',
    how: 'Zero runtime dependencies and no install scripts. There is nothing else to audit.',
    status: 'none',
    cwes: [],
    owasp: SUPPLY_CHAIN,
    proof: 'packages/exprit/package.json',
  },
];

export const STATUS_LABELS: Readonly<Record<CheckStatus, string>> = {
  blocked: 'blocked',
  bounded: 'bounded',
  escaped: 'escaped',
  none: 'zero deps',
};

export const cweHref = (id: number): string =>
  `https://cwe.mitre.org/data/definitions/${id}.html`;

/** A link into the repository on GitHub, or `undefined` while none is set. */
export const repositoryHref = (path: string): string | undefined =>
  SITE.repositoryUrl ? `${SITE.repositoryUrl}/blob/main/${path}` : undefined;
