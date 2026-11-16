import { render, screen, fireEvent, within } from '@testing-library/react';
import { ThemeProvider } from '@/components/ThemeProvider';

let mockIssueRow = null;
let mockSession = null;

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: mockSession } }),
    },
    from: () => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        single: () => Promise.resolve({ data: mockIssueRow, error: null }),
      };
      return builder;
    },
  },
}));

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'issue-1' }),
}));

import IssuePage from '@/app/issue/[id]/page';

const ISSUE = {
  id: 'issue-1',
  github_issue_number: 42,
  repo_name: 'org/repo',
  title: 'Fix login redirect',
  body: 'Login redirects to the wrong page',
  url: 'https://github.com/org/repo/issues/42',
  language: 'JavaScript',
  score: 8,
  summary: 'The login flow sends users to a 404.',
};

const mockFetchJson = (body) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });

const renderPage = () =>
  render(
    <ThemeProvider>
      <IssuePage />
    </ThemeProvider>
  );

describe('issue page', () => {
  beforeEach(() => {
    mockIssueRow = ISSUE;
    mockSession = { access_token: 'tok-u1' };
    global.fetch = jest.fn();
  });

  it('renders the issue details with a difficulty badge and GitHub link', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Fix login redirect' })).toBeInTheDocument();
    expect(screen.getByText('org/repo')).toBeInTheDocument();
    expect(screen.getByText('JavaScript')).toBeInTheDocument();
    expect(screen.getByText('Difficulty: 8/10')).toHaveClass('quest-difficulty', 'difficulty-hard');
    expect(screen.getByText('The login flow sends users to a 404.')).toBeInTheDocument();
    const githubLink = screen.getByRole('link', { name: 'Open on GitHub' });
    expect(githubLink).toHaveAttribute('href', ISSUE.url);
    expect(githubLink).toHaveAttribute('target', '_blank');
    expect(githubLink).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('posts only the issue id with the bearer token to the context endpoint and lists the suggested files', async () => {
    global.fetch.mockReturnValue(mockFetchJson({ suggested_files: ['src/auth/login.js', 'src/routes.js'] }));
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Suggest files to start with' }));

    expect(await screen.findByText('src/auth/login.js')).toBeInTheDocument();
    expect(screen.getByText('src/routes.js')).toBeInTheDocument();
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toMatch(/\/api\/rag\/context$/);
    expect(JSON.parse(options.body)).toEqual({ issueId: 'issue-1' });
    expect(options.headers.Authorization).toBe('Bearer tok-u1');
  });

  it('shows "No suggestions" when the context endpoint returns no files', async () => {
    global.fetch.mockReturnValue(mockFetchJson({ suggested_files: [] }));
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Suggest files to start with' }));

    expect(await screen.findByText('No suggestions')).toBeInTheDocument();
  });

  it('posts only the issue id with the bearer token to the thread-summary endpoint and lists the steps in order', async () => {
    global.fetch.mockReturnValue(mockFetchJson({ steps: ['Reproduce the redirect', 'Fix the route guard'] }));
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Summarize the thread' }));

    const list = await screen.findByRole('list');
    expect(list.tagName).toBe('OL');
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Reproduce the redirect',
      'Fix the route guard',
    ]);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toMatch(/\/api\/rag\/thread-summary$/);
    expect(JSON.parse(options.body)).toEqual({ issueId: 'issue-1' });
    expect(options.headers.Authorization).toBe('Bearer tok-u1');
  });

  it('shows the API error when a request fails', async () => {
    global.fetch.mockReturnValue(
      Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ error: 'Issue not found on GitHub' }) })
    );
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Summarize the thread' }));

    expect(await screen.findByText(/Issue not found on GitHub/)).toBeInTheDocument();
  });

  it('hides the thread summary button when the issue has no GitHub issue number', async () => {
    mockIssueRow = { ...ISSUE, github_issue_number: null };
    renderPage();

    await screen.findByRole('heading', { name: 'Fix login redirect' });
    expect(screen.queryByRole('button', { name: 'Summarize the thread' })).not.toBeInTheDocument();
  });

  it('omits the Authorization header when there is no session and shows the backend 401', async () => {
    mockSession = null;
    global.fetch.mockReturnValue(
      Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({ error: 'Authentication required' }) })
    );
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Suggest files to start with' }));

    expect(await screen.findByText(/Authentication required/)).toBeInTheDocument();
    expect(global.fetch.mock.calls[0][1].headers).not.toHaveProperty('Authorization');
  });

  it('shows a not-found state when the issue does not exist', async () => {
    mockIssueRow = null;
    renderPage();

    expect(await screen.findByText('Issue not found.')).toBeInTheDocument();
  });
});
