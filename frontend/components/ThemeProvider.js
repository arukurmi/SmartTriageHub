"use client";

import { createContext, useContext, useLayoutEffect, useSyncExternalStore } from 'react';
import { THEME_STORAGE_KEY, applyPreferredTheme } from '@/lib/theme';

const ThemeContext = createContext();

const subscribeToHtmlClass = (onChange) => {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributeFilter: ['class'] });
  return () => observer.disconnect();
};
const htmlHasDarkClass = () => document.documentElement.classList.contains('dark');

export function ThemeProvider({ children }) {
  const isDarkMode = useSyncExternalStore(subscribeToHtmlClass, htmlHasDarkClass, () => false);

  /** Strict Mode's dev remount strips the class the inline script put on <html>. */
  useLayoutEffect(() => {
    applyPreferredTheme(THEME_STORAGE_KEY);
  }, []);

  const toggleTheme = () => {
    const nextIsDark = !htmlHasDarkClass();
    document.documentElement.classList.toggle('dark', nextIsDark);
    localStorage.setItem(THEME_STORAGE_KEY, nextIsDark ? 'dark' : 'light');
  };

  return (
    <ThemeContext.Provider value={{ isDarkMode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
