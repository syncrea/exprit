/** Sidebar and table-of-contents data for the docs layout. */
export interface SidebarItem {
  readonly href: string;
  readonly label: string;
  /** Render in Geist Mono (API names). */
  readonly mono?: boolean;
  /** Nested one level (members under a group). */
  readonly nested?: boolean;
  readonly current?: boolean;
}

export interface SidebarGroup {
  readonly title: string;
  readonly items: readonly SidebarItem[];
}

export interface TocItem {
  readonly depth: number;
  readonly slug: string;
  readonly text: string;
}

export interface PageLink {
  readonly href: string;
  readonly label: string;
}

/** Headings as Astro reports them for Markdown and MDX. */
export interface MarkdownHeading {
  readonly depth: number;
  readonly slug: string;
  readonly text: string;
}

/** TypeDoc marks deprecated names with ~~strike~~; headings report the plain text. */
export const cleanHeading = (text: string): string =>
  text.replace(/~~/g, '').trim();

export const REFERENCE_LINKS: readonly PageLink[] = [
  { href: '/getting-started/', label: 'Getting started' },
  { href: '/api/', label: 'Functional API' },
  { href: '/api/core/', label: 'Core (advanced)' },
  { href: '/playground/', label: 'Playground' },
];
