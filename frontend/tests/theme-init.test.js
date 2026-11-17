import { THEME_STORAGE_KEY, themeInitScript } from '@/lib/theme';

const runThemeInitScript = () => new Function(themeInitScript)();
const mockOsPrefersDark = (prefersDark) => {
  window.matchMedia = jest.fn(() => ({ matches: prefersDark }));
};
const htmlIsDark = () => document.documentElement.classList.contains('dark');

describe('theme init script', () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
    delete window.matchMedia;
  });

  it('applies the dark theme when nothing is saved and the OS prefers dark', () => {
    mockOsPrefersDark(true);
    runThemeInitScript();
    expect(htmlIsDark()).toBe(true);
  });

  it('applies the light theme when nothing is saved and the OS prefers light', () => {
    mockOsPrefersDark(false);
    runThemeInitScript();
    expect(htmlIsDark()).toBe(false);
  });

  it('prefers a saved light choice over an OS dark preference', () => {
    mockOsPrefersDark(true);
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    runThemeInitScript();
    expect(htmlIsDark()).toBe(false);
  });

  it('prefers a saved dark choice over an OS light preference', () => {
    mockOsPrefersDark(false);
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    runThemeInitScript();
    expect(htmlIsDark()).toBe(true);
  });

  it('falls back to light without throwing when the browser has no matchMedia', () => {
    expect(runThemeInitScript).not.toThrow();
    expect(htmlIsDark()).toBe(false);
  });
});
