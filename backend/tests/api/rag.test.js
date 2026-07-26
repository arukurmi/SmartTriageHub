const request = require('supertest');
const express = require('express');

// Mock the RAG service so these tests exercise only the route's validation and
// error handling — no real Gemini calls.
jest.mock('../../services/rag', () => ({
  analyzeIssueContext: jest.fn(),
}));
const { analyzeIssueContext } = require('../../services/rag');
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
