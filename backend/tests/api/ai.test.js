const request = require('supertest');
const express = require('express');

process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';

const state = { user: null };

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: () =>
        Promise.resolve(
          state.user
            ? { data: { user: state.user }, error: null }
            : { data: { user: null }, error: { message: 'invalid jwt' } }
        ),
    },
  })),
}));

jest.mock('../../cron/ingestIssues', () => ({ ingestIssues: jest.fn() }));

const { ingestIssues } = require('../../cron/ingestIssues');
const aiRouter = require('../../routes/ai');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/ai', aiRouter);
  return app;
};

const trigger = (app, { token = 'valid-token' } = {}) => {
  const req = request(app).post('/api/ai/trigger-ingestion');
  if (token) req.set('Authorization', `Bearer ${token}`);
  return req;
};

const confirmedUser = (email) => ({ id: 'u1', email, email_confirmed_at: '2026-01-01T00:00:00Z' });

beforeEach(() => {
  process.env.ADMIN_EMAILS = 'admin@example.com, ops@example.com';
  state.user = confirmedUser('admin@example.com');
  ingestIssues.mockResolvedValue();
});
afterAll(() => {
  delete process.env.ADMIN_EMAILS;
});

describe('POST /api/ai/trigger-ingestion', () => {
  it('rejects a request with no token (401)', async () => {
    const res = await trigger(buildApp(), { token: null });
    expect(res.status).toBe(401);
    expect(ingestIssues).not.toHaveBeenCalled();
  });

  it('rejects a signed-in user who is not an admin (403)', async () => {
    state.user = confirmedUser('someone@example.com');
    const res = await trigger(buildApp());
    expect(res.status).toBe(403);
    expect(ingestIssues).not.toHaveBeenCalled();
  });

  it('rejects an admin address whose email is not confirmed (403)', async () => {
    state.user = { id: 'u2', email: 'admin@example.com', email_confirmed_at: null };
    const res = await trigger(buildApp());
    expect(res.status).toBe(403);
    expect(ingestIssues).not.toHaveBeenCalled();
  });

  it('rejects everyone when ADMIN_EMAILS is unset (403)', async () => {
    delete process.env.ADMIN_EMAILS;
    const res = await trigger(buildApp());
    expect(res.status).toBe(403);
    expect(ingestIssues).not.toHaveBeenCalled();
  });

  it('starts ingestion for an admin, matching the email case-insensitively', async () => {
    state.user = confirmedUser('Ops@Example.COM');
    const res = await trigger(buildApp());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Ingestion started' });
    expect(ingestIssues).toHaveBeenCalledTimes(1);
  });

  it('refuses a second run while one is in flight, then allows one after it finishes', async () => {
    let finishRun;
    ingestIssues.mockReturnValueOnce(new Promise((resolve) => { finishRun = resolve; }));
    const app = buildApp();

    expect((await trigger(app)).status).toBe(200);
    const overlapping = await trigger(app);
    expect(overlapping.status).toBe(409);
    expect(overlapping.body).toEqual({ error: 'Ingestion already running' });
    expect(ingestIssues).toHaveBeenCalledTimes(1);

    finishRun();
    await new Promise((resolve) => setImmediate(resolve));
    expect((await trigger(app)).status).toBe(200);
  });
});
