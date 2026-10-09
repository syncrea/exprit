import exprit from '@syncrea/exprit/package.json' with { type: 'json' };

export interface NavItem {
  readonly href: string;
  readonly label: string;
}

export interface SiteConfig {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly version: string;
  /**
   * The public source repository. Links to it (footer, "edit this page") are
   * only rendered once this is set.
   */
  readonly repositoryUrl?: string;
  readonly installCommand: string;
}

export const SITE: SiteConfig = {
  name: 'exprit',
  title: 'exprit: expressions, evaluated',
  description:
    'A TypeScript-first expression parser and evaluator. A drop-in replacement for expr-eval, plus a dialect that reads like JavaScript. No eval, no new Function.',
  version: exprit.version,
  repositoryUrl: 'https://github.com/syncrea/exprit',
  installCommand: 'npm i @syncrea/exprit',
};

/** The top navigation: exactly these three items, plus the logo link home. */
export const NAV: readonly NavItem[] = [
  { href: '/getting-started/', label: 'Getting Started' },
  { href: '/api/', label: 'API' },
  { href: '/playground/', label: 'Playground' },
];

/** Whether `href` is the current section, for `aria-current`. */
export const isCurrent = (href: string, pathname: string): boolean => {
  const normalize = (path: string): string =>
    path.endsWith('/') ? path : `${path}/`;
  return normalize(pathname).startsWith(normalize(href));
};
