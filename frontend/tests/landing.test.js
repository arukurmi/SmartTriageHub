import { render, screen } from '@testing-library/react';
import Home from '@/app/page';
import { ThemeProvider } from '@/components/ThemeProvider';

// The home page renders GlobalHeader, which calls useTheme() and therefore
// needs a ThemeProvider ancestor — mirroring how layout.js mounts the app.
const renderWithProviders = (ui) => render(<ThemeProvider>{ui}</ThemeProvider>);

describe('Landing page', () => {
  it('renders the hero heading and primary call to action', () => {
    renderWithProviders(<Home />);

    expect(
      screen.getByRole('heading', {
        name: /Find open source issues and start your open source journey/i,
      })
    ).toBeInTheDocument();

    const cta = screen.getByRole('link', { name: /Start Picking Issues/i });
    expect(cta).toBeInTheDocument();
    expect(cta).toHaveAttribute('href', '/board');
  });

  it('renders the header brand and feature sections', () => {
    renderWithProviders(<Home />);

    // Brand appears in the header logo link.
    expect(screen.getByText('SmartTriageHub')).toBeInTheDocument();
    // Both feature cards are present.
    expect(
      screen.getByRole('heading', { name: /AI-Powered Triage/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Gamified Development/i })
    ).toBeInTheDocument();
  });
});
