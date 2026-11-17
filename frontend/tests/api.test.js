const respondWith = ({ ok = true, status = 200, json = () => Promise.resolve({}) } = {}) => {
  global.fetch = jest.fn(() => Promise.resolve({ ok, status, json }));
};

describe('apiFetch', () => {
  const originalEnv = process.env;
  let apiFetch;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv, NEXT_PUBLIC_API_URL: 'https://api.example.com' };
    ({ apiFetch } = require('@/lib/api'));
  });
  afterEach(() => {
    process.env = originalEnv;
    delete global.fetch;
  });

  it('sends a GET to NEXT_PUBLIC_API_URL with no headers by default', async () => {
    respondWith({ json: () => Promise.resolve({ items: [] }) });

    await expect(apiFetch('/api/things')).resolves.toEqual({ items: [] });
    expect(global.fetch).toHaveBeenCalledWith('https://api.example.com/api/things', {
      method: 'GET',
      headers: {},
      body: undefined,
    });
  });

  it('serialises the body as JSON and adds the bearer token', async () => {
    respondWith();

    await apiFetch('/api/rag/context', { method: 'POST', token: 'tok-u1', body: { issueId: 'issue-1' } });

    expect(global.fetch).toHaveBeenCalledWith('https://api.example.com/api/rag/context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok-u1' },
      body: '{"issueId":"issue-1"}',
    });
  });

  it('throws the backend error message with the response status', async () => {
    respondWith({ ok: false, status: 429, json: () => Promise.resolve({ error: 'GitHub rate limit hit' }) });

    await expect(apiFetch('/api/profile/sync-github')).rejects.toMatchObject({
      message: 'GitHub rate limit hit',
      status: 429,
    });
  });

  it('throws a generic message when the response is not JSON', async () => {
    respondWith({ ok: false, status: 502, json: () => Promise.reject(new SyntaxError('Unexpected token <')) });

    await expect(apiFetch('/api/auth/login')).rejects.toMatchObject({
      message: 'An unexpected server error occurred. Please try again later.',
      status: 502,
    });
  });

  it('treats a successful response without a JSON body as an error', async () => {
    respondWith({ json: () => Promise.reject(new SyntaxError('Unexpected end of JSON input')) });

    await expect(apiFetch('/api/auth/logout')).rejects.toMatchObject({ status: 200 });
  });
});
