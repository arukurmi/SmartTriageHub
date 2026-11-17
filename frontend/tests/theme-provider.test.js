import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, useTheme } from '@/components/ThemeProvider';
import { THEME_STORAGE_KEY } from '@/lib/theme';

function ThemeToggle() {
  const { isDarkMode, toggleTheme } = useTheme();
  return <button onClick={toggleTheme}>{isDarkMode ? 'dark' : 'light'}</button>;
}

const renderToggle = () =>
  render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>
  );
const htmlIsDark = () => document.documentElement.classList.contains('dark');

describe('ThemeProvider', () => {
  beforeEach(() => {
    window.matchMedia = jest.fn(() => ({ matches: true }));
  });
  afterEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
    delete window.matchMedia;
  });

  it('follows the OS preference without saving a choice', () => {
    renderToggle();

    expect(htmlIsDark()).toBe(true);
    expect(screen.getByRole('button')).toHaveTextContent('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it('saves the toggled theme and updates the html class and consumers', async () => {
    renderToggle();

    fireEvent.click(screen.getByRole('button'));

    expect(htmlIsDark()).toBe(false);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(await screen.findByRole('button', { name: 'light' })).toBeInTheDocument();
  });
});
