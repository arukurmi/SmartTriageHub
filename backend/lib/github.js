// Shared helpers for talking to the GitHub REST/search API.

// Standard headers for GitHub API calls. Adds token auth when GITHUB_TOKEN is
// set (raising the rate limit from 10 to 30 search req/min), otherwise makes
// unauthenticated requests.
const githubHeaders = () => ({
  Accept: 'application/vnd.github+json',
  ...(process.env.GITHUB_TOKEN ? { Authorization: `token ${process.env.GITHUB_TOKEN}` } : {}),
});

// Default timeout (ms) for GitHub calls so a hung connection can't stall a
// cron/sync loop.
const GITHUB_TIMEOUT_MS = 10000;

module.exports = { githubHeaders, GITHUB_TIMEOUT_MS };
