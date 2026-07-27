const { githubHeaders, GITHUB_TIMEOUT_MS } = require('../../lib/github');

describe('githubHeaders', () => {
  const original = process.env.GITHUB_TOKEN;
  afterEach(() => {
    if (original === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = original;
  });

  it('always requests the GitHub JSON media type', () => {
    delete process.env.GITHUB_TOKEN;
    expect(githubHeaders().Accept).toBe('application/vnd.github+json');
  });

  it('omits Authorization when no token is configured', () => {
    delete process.env.GITHUB_TOKEN;
    expect(githubHeaders().Authorization).toBeUndefined();
  });

  it('adds a token Authorization header when GITHUB_TOKEN is set', () => {
    process.env.GITHUB_TOKEN = 'abc123';
    expect(githubHeaders().Authorization).toBe('token abc123');
  });

  it('exposes a positive default timeout', () => {
    expect(GITHUB_TIMEOUT_MS).toBeGreaterThan(0);
  });
});
