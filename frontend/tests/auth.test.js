import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Home from '@/app/page';

// Mock the Supabase client
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: jest.fn().mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }),
    },
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
    })
  }
}));

describe('Frontend Graceful Error Handling', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    // We start by mounting the unauthenticated state
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('displays a generic network error message when the backend returns a non-JSON (HTML) 500 error page', async () => {
    // Mock fetch to return a standard Express/Next.js 500 HTML payload (simulate crash)
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers({ 'content-type': 'text/html' }),
      json: jest.fn().mockRejectedValue(new Error("Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON"))
    });

    render(<Home />);

    // Wait for initial render (it starts as loading, then unauthenticated state)
    await waitFor(() => {
      expect(screen.getByText('SmartTriageHub', { selector: 'h1.quest-board-title' })).toBeInTheDocument();
    });

    // Fill in email and password
    fireEvent.change(screen.getByPlaceholderText('developer@company.com'), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('Your password'), { target: { value: 'password123' } });

    // Click Sign In
    fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));

    // Wait for the error message to appear in the UI
    await waitFor(() => {
      expect(screen.getByText(/An unexpected server error occurred\. Please try again later\./i)).toBeInTheDocument();
    });

    // Verify it NEVER displayed the raw 'Unexpected token' error message to the user
    expect(screen.queryByText(/Unexpected token/i)).not.toBeInTheDocument();
  });
});
