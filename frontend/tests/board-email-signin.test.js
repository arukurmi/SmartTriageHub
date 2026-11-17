import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider } from '@/components/ThemeProvider';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      setSession: (...args) => mockSetSession(...args),
    },
  },
}));

import Home from '@/app/board/page';

const mockSetSession = jest.fn(() => Promise.resolve({ data: {}, error: null }));

const respondWith = (ok, body) => {
  global.fetch = jest.fn(() => Promise.resolve({ ok, status: ok ? 200 : 401, json: () => Promise.resolve(body) }));
};

const submitSignIn = async () => {
  render(
    <ThemeProvider>
      <Home />
    </ThemeProvider>
  );
  fireEvent.change(await screen.findByPlaceholderText('developer@company.com'), { target: { value: 'dev@example.com' } });
  fireEvent.change(screen.getByPlaceholderText('Your password'), { target: { value: 'hunter22' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
};

describe('board email sign in', () => {
  afterEach(() => {
    delete global.fetch;
    mockSetSession.mockClear();
  });

  it('posts the credentials as JSON and stores the returned session', async () => {
    respondWith(true, { session: { access_token: 'acc', refresh_token: 'ref' } });

    await submitSignIn();

    await waitFor(() => expect(mockSetSession).toHaveBeenCalledWith({ access_token: 'acc', refresh_token: 'ref' }));
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toMatch(/\/api\/auth\/login$/);
    expect(options.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(options.body)).toEqual({ email: 'dev@example.com', password: 'hunter22' });
  });

  it('shows the backend error message when sign in is rejected', async () => {
    respondWith(false, { error: 'Invalid email or password' });

    await submitSignIn();

    expect(await screen.findByText('Error: Invalid email or password')).toBeInTheDocument();
    expect(mockSetSession).not.toHaveBeenCalled();
  });
});
