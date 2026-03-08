import React, { createContext, useContext, useState, useEffect } from 'react';

const THEMES = ['emerald', 'bumblebee', 'halloween', 'forest', 'lemonade'];
const DEFAULT_THEME = 'emerald';
const STORAGE_KEY = 'pbi-theme';

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return THEMES.includes(saved) ? saved : DEFAULT_THEME;
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const setTheme = (t) => {
    if (THEMES.includes(t)) setThemeState(t);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
