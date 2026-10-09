/**
 * Highlights the section the reader is in, in both the sidebar and the
 * "On this page" list, as they scroll. An IntersectionObserver on the headings
 * (and on a sentinel at the end of the content) triggers the update, so there
 * is no scroll listener.
 */

/** Gap below the sticky header at which a heading counts as "reached". */
const ACTIVATION_OFFSET_PX = 24;

/**
 * Index of the active section: the last heading at or above the activation
 * line, or the last heading once the page is scrolled to the end (short final
 * sections never reach the line). `-1` while the reader is above the first one.
 */
export const pickActiveIndex = (
  headingTops: readonly number[],
  activationLine: number,
  isAtEnd: boolean,
): number => {
  if (isAtEnd && headingTops.length > 0) {
    return headingTops.length - 1;
  }
  return headingTops.reduce(
    (active, top, index) => (top <= activationLine ? index : active),
    -1,
  );
};

const headerHeight = (): number =>
  Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue(
      '--header-height',
    ),
  ) || 0;

const slugOf = (link: HTMLAnchorElement): string =>
  decodeURIComponent(link.hash.slice(1));

/** Scrolls a sticky nav so its active link stays visible, without moving the page. */
const revealInContainer = (link: HTMLElement): void => {
  const container = link.closest<HTMLElement>('.docs-sidebar, .docs-toc');
  if (!container || getComputedStyle(container).position !== 'sticky') {
    return;
  }
  const linkBox = link.getBoundingClientRect();
  const box = container.getBoundingClientRect();
  if (linkBox.top < box.top) {
    container.scrollTop -= box.top - linkBox.top + 8;
  } else if (linkBox.bottom > box.bottom) {
    container.scrollTop += linkBox.bottom - box.bottom + 8;
  }
};

export const initScrollSpy = (): void => {
  const links = [
    ...document.querySelectorAll<HTMLAnchorElement>(
      '.docs-sidebar a[href^="#"], .docs-toc a[href^="#"]',
    ),
  ];
  const slugs = [...new Set(links.map(slugOf))];
  // In document order: the sidebar lists only sections, the "On this page"
  // list also subsections, so link order is not page order.
  const headings = slugs
    .map((slug) => document.getElementById(slug))
    .filter((heading): heading is HTMLElement => heading !== null)
    .sort((a, b) =>
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
    );
  const end = document.querySelector<HTMLElement>('[data-scroll-end]');
  if (headings.length === 0 || !('IntersectionObserver' in window)) {
    return;
  }

  let activeSlug: string | undefined;
  let isAtEnd = false;

  const setActive = (slug: string | undefined): void => {
    if (slug === activeSlug) {
      return;
    }
    activeSlug = slug;
    for (const link of links) {
      if (slug !== undefined && slugOf(link) === slug) {
        link.setAttribute('aria-current', 'location');
        revealInContainer(link);
      } else if (link.getAttribute('aria-current') === 'location') {
        link.removeAttribute('aria-current');
      }
    }
  };

  const update = (): void => {
    const tops = headings.map((heading) => heading.getBoundingClientRect().top);
    const index = pickActiveIndex(
      tops,
      headerHeight() + ACTIVATION_OFFSET_PX,
      isAtEnd,
    );
    setActive(index === -1 ? undefined : headings[index].id);
  };

  // The band starts at the activation line. Threshold 1 fires the moment a
  // heading's top edge crosses that line (it stops being fully inside the
  // band); threshold 0 fires when it enters or leaves the viewport entirely.
  const headingObserver = new IntersectionObserver(update, {
    rootMargin: `-${headerHeight() + ACTIVATION_OFFSET_PX}px 0px 0px 0px`,
    threshold: [0, 1],
  });
  headings.forEach((heading) => headingObserver.observe(heading));

  if (end) {
    new IntersectionObserver((entries) => {
      // Only once the reader has scrolled: a short page shows its end on load.
      isAtEnd =
        window.scrollY > 0 && entries.some((entry) => entry.isIntersecting);
      update();
    }).observe(end);
  }

  // Belt and braces: re-check once a scroll settles, where supported.
  window.addEventListener('scrollend', update, { passive: true });

  // A click jumps straight to its section, even one too short to reach the line.
  for (const link of links) {
    link.addEventListener('click', () => setActive(slugOf(link)));
  }

  update();
};
