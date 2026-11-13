import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider } from '@/components/ThemeProvider';

function makeBuilder() {
  const builder = {
    select: () => builder,
    eq: () => builder,
    lte: () => builder,
    gte: () => builder,
    ilike: () => builder,
    order: () => builder,
    single: () => Promise.resolve({ data: { id: 'u1', xp: 0, level: 1, daily_streak: 0 }, error: null }),
    range: () => Promise.resolve({ data: [], count: 0, error: null }),
  };
  return builder;
}

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () =>
        Promise.resolve({ data: { session: { access_token: 'tok-u1', user: { id: 'u1' } } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: () => Promise.resolve(),
    },
    from: () => makeBuilder(),
  },
}));

import Home from '@/app/board/page';

describe('board sign out', () => {
  beforeEach(() => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
  });
  afterEach(() => {
    delete global.fetch;
  });

  it('sends the session bearer token to the backend logout', async () => {
    render(
      <ThemeProvider>
        <Home />
      </ThemeProvider>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Sign Out' }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/auth\/logout$/),
        expect.objectContaining({ headers: { Authorization: 'Bearer tok-u1' } })
      )
    );
  });
});
