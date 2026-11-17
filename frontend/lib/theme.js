export const THEME_STORAGE_KEY = 'smarttriagehub-theme';

/** Serialised into an inline script, so it must not reference anything outside its own body. */
export function applyPreferredTheme(storageKey) {
  try {
    const savedTheme = localStorage.getItem(storageKey);
    const isDark = savedTheme ? savedTheme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', isDark);
  } catch {}
}

export const themeInitScript = `(${applyPreferredTheme})(${JSON.stringify(THEME_STORAGE_KEY)})`;
