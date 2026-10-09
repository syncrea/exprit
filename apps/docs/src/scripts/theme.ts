/**
 * Theme state. The stored choice wins; without one the OS preference applies
 * (handled by CSS alone, so no attribute is set until the visitor chooses).
 */
export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'exprit-theme';

const THEME_COLORS: Readonly<Record<Theme, string>> = {
  dark: '#0A0B0D',
  light: '#F7F8F4',
};

export const currentTheme = (): Theme => {
  const chosen = document.documentElement.dataset['theme'];
  if (chosen === 'light' || chosen === 'dark') {
    return chosen;
  }
  return window.matchMedia('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark';
};

export const setTheme = (theme: Theme): void => {
  document.documentElement.dataset['theme'] = theme;
  document
    .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
    .forEach((meta) => {
      meta.content = THEME_COLORS[theme];
      meta.removeAttribute('media');
    });
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (error) {
    // Storage can be unavailable (private mode, blocked cookies); the theme
    // still applies for this page view.
    console.warn('Could not store the theme choice', error);
  }
};
