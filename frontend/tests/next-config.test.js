async function loadReportOnlyPolicy() {
  const { default: nextConfig } = await import('../next.config.mjs');
  const [{ headers }] = await nextConfig.headers();
  return headers.find((header) => header.key === 'Content-Security-Policy-Report-Only').value;
}

describe('next config Content-Security-Policy-Report-Only', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });
  afterAll(() => {
    process.env = originalEnv;
  });

  it('allows the API and Supabase origins, GitHub API, and Google Fonts hosts', async () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://api.example.com/v1';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abc.supabase.co/';

    const policy = await loadReportOnlyPolicy();

    expect(policy).toContain("connect-src 'self' https://api.example.com https://abc.supabase.co https://api.github.com");
    expect(policy).toContain("style-src 'self' 'unsafe-inline' https://fonts.googleapis.com");
    expect(policy).toContain("font-src 'self' https://fonts.gstatic.com");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).not.toContain("'unsafe-eval'");
  });

  it('falls back to the local API origin and omits Supabase when unset', async () => {
    delete process.env.NEXT_PUBLIC_API_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;

    const policy = await loadReportOnlyPolicy();

    expect(policy).toContain("connect-src 'self' http://localhost:5000 https://api.github.com");
  });
});
