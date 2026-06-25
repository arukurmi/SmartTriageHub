"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Only access localStorage on the client side
    const savedTheme = localStorage.getItem('smarttriagehub-theme');
    if (savedTheme !== null) {
      setIsDarkMode(savedTheme === 'dark');
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('smarttriagehub-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('smarttriagehub-theme', 'light');
    }
  }, [isDarkMode, mounted]);

  const toggleTheme = () => setIsDarkMode(prev => !prev);

  return (
    <ThemeContext.Provider value={{ isDarkMode, toggleTheme }}>
      {!mounted ? <div style={{ visibility: 'hidden' }}>{children}</div> : children}
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
