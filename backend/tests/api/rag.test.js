const request = require('supertest');
const express = require('express');

// Mock the RAG service so these tests exercise only the route's validation and
// error handling — no real Gemini calls.
jest.mock('../../services/rag', () => ({
  analyzeIssueContext: jest.fn(),
  summarizeThread: jest.fn(),
}));
const { analyzeIssueContext, summarizeThread } = require('../../services/rag');
const ragRoutes = require('../../routes/rag');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/rag', ragRoutes);
  return app;
};

describe('POST /api/rag/context', () => {
  let app;
  beforeEach(() => {
    app = buildApp();
  });

  it('rejects a non-string issueBody with 400', async () => {
    const res = await request(app).post('/api/rag/context').send({ issueBody: 42 });
    expect(res.status).toBe(400);
    expect(analyzeIssueContext).not.toHaveBeenCalled();
  });

  it('rejects an oversized issueBody with 413', async () => {
    const res = await request(app)
      .post('/api/rag/context')
      .send({ issueBody: 'x'.repeat(20001) });
    expect(res.status).toBe(413);
    expect(analyzeIssueContext).not.toHaveBeenCalled();
  });

  it('returns the service result for a valid body', async () => {
    analyzeIssueContext.mockResolvedValue({ suggested_files: ['a.js'] });
    const res = await request(app)
      .post('/api/rag/context')
      .send({ issueBody: 'login is broken' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ suggested_files: ['a.js'] });
  });

  it('rejects a repoName that is not owner/repo with 400', async () => {
    for (const repoName of ['not a repo', 'a/b/c', '../etc', 'owner/..', ['a/b'], 42]) {
      const res = await request(app)
        .post('/api/rag/context')
        .send({ issueBody: 'login is broken', repoName });
      expect(res.status).toBe(400);
    }
    expect(analyzeIssueContext).not.toHaveBeenCalled();
  });

  it('passes repoName through to the service', async () => {
    analyzeIssueContext.mockResolvedValue({ suggested_files: ['src/a.js'] });
    const res = await request(app)
      .post('/api/rag/context')
      .send({ issueBody: 'login is broken', repoName: 'facebook/react.dev' });
    expect(res.status).toBe(200);
    expect(analyzeIssueContext).toHaveBeenCalledWith('login is broken', 'facebook/react.dev');
  });

  it('does not leak internal error details when the service throws', async () => {
    analyzeIssueContext.mockRejectedValue(new Error('SECRET provider failure'));
    const res = await request(app)
      .post('/api/rag/context')
      .send({ issueBody: 'boom' });
    expect(res.status).toBe(500);
    expect(res.text).not.toContain('SECRET provider failure');
    expect(res.body).toEqual({ error: 'Could not analyze issue context' });
  });
});

describe('POST /api/rag/thread-summary', () => {
  let app;
  beforeEach(() => {
    app = buildApp();
  });

  const githubError = (status) =>
    Object.assign(new Error(`Request failed with status code ${status}`), { response: { status } });

  it('rejects an invalid repoName with 400', async () => {
    const res = await request(app)
      .post('/api/rag/thread-summary')
      .send({ repoName: 'org/repo/issues', issueNumber: 1 });
    expect(res.status).toBe(400);
    expect(summarizeThread).not.toHaveBeenCalled();
  });

  it('rejects a non-positive or non-integer issueNumber with 400', async () => {
    for (const issueNumber of [0, -1, 1.5, '7', undefined]) {
      const res = await request(app)
        .post('/api/rag/thread-summary')
        .send({ repoName: 'org/repo', issueNumber });
      expect(res.status).toBe(400);
    }
    expect(summarizeThread).not.toHaveBeenCalled();
  });

  it('returns the steps from the service', async () => {
    summarizeThread.mockResolvedValue({ steps: ['Reproduce', 'Fix'] });
    const res = await request(app)
      .post('/api/rag/thread-summary')
      .send({ repoName: 'org/repo', issueNumber: 12 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ steps: ['Reproduce', 'Fix'] });
    expect(summarizeThread).toHaveBeenCalledWith('org/repo', 12);
  });

  it('maps a GitHub 404 to 404', async () => {
    summarizeThread.mockRejectedValue(githubError(404));
    const res = await request(app)
      .post('/api/rag/thread-summary')
      .send({ repoName: 'org/repo', issueNumber: 12 });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Issue not found on GitHub' });
  });

  it.each([403, 429])('maps a GitHub %i to 429', async (status) => {
    summarizeThread.mockRejectedValue(githubError(status));
    const res = await request(app)
      .post('/api/rag/thread-summary')
      .send({ repoName: 'org/repo', issueNumber: 12 });
    expect(res.status).toBe(429);
  });

  it('does not leak internal error details on other failures', async () => {
    summarizeThread.mockRejectedValue(new Error('SECRET provider failure'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(app)
      .post('/api/rag/thread-summary')
      .send({ repoName: 'org/repo', issueNumber: 12 });
    expect(res.status).toBe(500);
    expect(res.text).not.toContain('SECRET provider failure');
    expect(res.body).toEqual({ error: 'Could not summarize issue thread' });
    consoleSpy.mockRestore();
  });
});
