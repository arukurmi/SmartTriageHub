import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider } from '@/components/ThemeProvider';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithOAuth: (...args) => mockSignInWithOAuth(...args),
    },
  },
}));

import Home from '@/app/board/page';

const mockSignInWithOAuth = jest.fn(() => Promise.resolve({ data: {}, error: null }));

describe('board GitHub sign in', () => {
  it('redirects the OAuth round-trip to the auth callback page', async () => {
    render(
      <ThemeProvider>
        <Home />
      </ThemeProvider>
    );

    fireEvent.click(await screen.findByRole('button', { name: /Sign in with GitHub/ }));

    await waitFor(() =>
      expect(mockSignInWithOAuth).toHaveBeenCalledWith({
        provider: 'github',
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      })
    );
  });
});
