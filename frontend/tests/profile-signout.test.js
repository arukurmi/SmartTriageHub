import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider } from '@/components/ThemeProvider';

function makeBuilder() {
  const builder = {
    select: () => builder,
    eq: () => builder,
    single: () => Promise.resolve({ data: { id: 'u1', xp: 0, level: 1, daily_streak: 0 }, error: null }),
  };
  return builder;
}

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () =>
        Promise.resolve({ data: { session: { access_token: 'tok-u1', user: { id: 'u1', identities: [] } } } }),
      signOut: (...args) => mockSignOut(...args),
    },
    from: () => makeBuilder(),
  },
}));

import ProfilePage from '@/app/profile/page';

const mockSignOut = jest.fn(() => Promise.resolve());

describe('profile sign out', () => {
  beforeEach(() => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
  });
  afterEach(() => {
    delete global.fetch;
  });

  it('signs out this device only', async () => {
    render(
      <ThemeProvider>
        <ProfilePage />
      </ThemeProvider>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Sign Out' }));

    await waitFor(() => expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' }));
  });
});
