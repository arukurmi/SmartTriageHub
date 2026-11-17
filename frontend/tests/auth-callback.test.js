import { render, screen, waitFor } from '@testing-library/react';
import { ThemeProvider } from '@/components/ThemeProvider';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      exchangeCodeForSession: (...args) => mockExchangeCodeForSession(...args),
    },
  },
}));

jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}));

import AuthCallbackPage from '@/app/auth/callback/page';

const mockExchangeCodeForSession = jest.fn();
const mockRouter = { replace: jest.fn() };

function renderAt(search) {
  window.history.pushState({}, '', `/auth/callback${search}`);
  return render(
    <ThemeProvider>
      <AuthCallbackPage />
    </ThemeProvider>
  );
}

describe('auth callback', () => {
  beforeEach(() => {
    mockExchangeCodeForSession.mockReset();
    mockRouter.replace.mockReset();
  });

  it('exchanges the code for a session and replaces the route with the board', async () => {
    mockExchangeCodeForSession.mockResolvedValue({ data: {}, error: null });

    renderAt('?code=abc123');

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/board'));
    expect(mockExchangeCodeForSession).toHaveBeenCalledTimes(1);
    expect(mockExchangeCodeForSession).toHaveBeenCalledWith('abc123');
  });

  it('shows the provider error and skips the exchange', async () => {
    renderAt('?error=access_denied&error_description=User%20denied%20access');

    expect(await screen.findByText(/User denied access/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/board');
    expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('shows an error when the callback has no code', async () => {
    renderAt('');

    expect(await screen.findByText(/no authorization code/)).toBeInTheDocument();
    expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('shows the exchange error and stays on the callback page', async () => {
    mockExchangeCodeForSession.mockResolvedValue({ data: {}, error: { message: 'invalid flow state' } });

    renderAt('?code=stale');

    expect(await screen.findByText(/invalid flow state/)).toBeInTheDocument();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('shows an error instead of hanging when the exchange request throws', async () => {
    mockExchangeCodeForSession.mockRejectedValue(new Error('Failed to fetch'));

    renderAt('?code=offline');

    expect(await screen.findByText(/Failed to fetch/)).toBeInTheDocument();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});
