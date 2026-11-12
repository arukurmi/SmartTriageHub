import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ThemeProvider } from '@/components/ThemeProvider';

// Controllable Supabase mock. Issue queries never resolve on their own — the
// test drives their resolution order to simulate slow/stale responses arriving
// after newer ones (the real-world race behind the filtering anomaly).
const pending = [];

function makeBuilder() {
  const state = { language: null, difficulty: false, from: null };
  const builder = {
    select: () => builder,
    eq: (col, val) => {
      if (col === 'language') state.language = val;
      return builder;
    },
    lte: (col) => {
      if (col === 'score') state.difficulty = true;
      return builder;
    },
    gte: () => builder,
    ilike: () => builder,
    order: () => builder,
    single: () =>
      Promise.resolve({
        data: { id: 'u1', xp: 650, level: 7, daily_streak: 1 },
        error: null,
      }),
    range: (from) =>
      new Promise((resolve) => {
        state.from = from;
        pending.push({ state, resolve });
      }),
  };
  return builder;
}

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () =>
        Promise.resolve({ data: { session: { user: { id: 'u1' } } } }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe() {} } },
      }),
      signOut: () => Promise.resolve(),
    },
    from: () => makeBuilder(),
  },
}));

import Home from '@/app/board/page';

const GO_ISSUE = {
  id: 'go-1',
  title: 'Create a validating webhook',
  language: 'Go',
  score: 5,
  url: 'https://example.com/go',
  summary: 'Summary unavailable.',
};
const JS_ISSUE = {
  id: 'js-1',
  title: 'Add security checklist',
  language: 'JavaScript',
  score: 3,
  url: 'https://example.com/js',
  summary: 'A JavaScript issue.',
};

const resolveRequest = (predicate, payload) => {
  const idx = pending.findIndex((p) => predicate(p.state));
  if (idx === -1) throw new Error('no matching pending request');
  const [req] = pending.splice(idx, 1);
  req.resolve(payload);
};

describe('board filtering race', () => {
  beforeEach(() => {
    pending.length = 0;
  });

  it('does not splice a stale unfiltered "Load More" response onto a freshly filtered list', async () => {
    render(
      <ThemeProvider>
        <Home />
      </ThemeProvider>
    );

    // Mount fires the initial All/All page-0 fetch. Resolve it so the board
    // renders. count > returned length keeps "Load More" available.
    await waitFor(() =>
      expect(pending.some((p) => p.state.language === null && p.state.from === 0)).toBe(true)
    );
    resolveRequest(
      (s) => s.language === null && s.from === 0,
      { data: [JS_ISSUE], count: 5, error: null }
    );
    await screen.findByText('Add security checklist');

    // User clicks "Load More" — this fires an APPEND fetch for the current
    // (All/All) filter, page 1. It is slow and stays in flight.
    fireEvent.click(screen.getByRole('button', { name: /Load More/i }));
    await waitFor(() =>
      expect(pending.some((p) => p.state.language === null && p.state.from > 0)).toBe(true)
    );

    // Before it returns, the user narrows the filter to JavaScript. This fires
    // a fresh replace fetch that resolves quickly with only the JS issue.
    const [langSelect] = screen.getAllByRole('combobox');
    fireEvent.change(langSelect, { target: { value: 'JavaScript' } });
    await waitFor(() =>
      expect(pending.some((p) => p.state.language === 'JavaScript')).toBe(true)
    );
    resolveRequest(
      (s) => s.language === 'JavaScript',
      { data: [JS_ISSUE], count: 1, error: null }
    );
    await screen.findByText('Add security checklist');

    // Now the stale All/All page-1 append finally resolves with unfiltered rows.
    // act() flushes the resulting state update so the assertion is deterministic.
    await act(async () => {
      resolveRequest(
        (s) => s.language === null && s.from > 0,
        { data: [GO_ISSUE], count: 5, error: null }
      );
    });

    // The stale append must NOT leak the non-matching Go issue into the list.
    expect(screen.queryByText('Create a validating webhook')).not.toBeInTheDocument();
    expect(screen.getByText('Add security checklist')).toBeInTheDocument();
  });
});
