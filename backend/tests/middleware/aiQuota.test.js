const request = require('supertest');
const express = require('express');

const mockQuota = { calls: [], data: 1, error: null };

jest.mock('../../lib/supabaseAdmin', () => ({
  rpc: (fn, args) => {
    mockQuota.calls.push([fn, args]);
    return Promise.resolve({ data: mockQuota.data, error: mockQuota.error });
  },
}));

const aiQuota = require('../../middleware/aiQuota');

const buildApp = () => {
  const app = express();
  app.post(
    '/ai',
    (req, res, next) => {
      req.user = { id: 'u1' };
      next();
    },
    aiQuota,
    (req, res) => res.json({ ok: true })
  );
  return app;
};

const callAi = () => request(buildApp()).post('/ai');

beforeEach(() => {
  mockQuota.calls = [];
  mockQuota.data = 1;
  mockQuota.error = null;
  delete process.env.AI_DAILY_LIMIT;
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => delete process.env.AI_DAILY_LIMIT);

describe('aiQuota', () => {
  it('consumes one call for the authenticated user with the default limit of 50', async () => {
    const res = await callAi();
    expect(res.status).toBe(200);
    expect(mockQuota.calls).toEqual([['consume_ai_call', { p_user_id: 'u1', p_daily_limit: 50 }]]);
  });

  it('uses AI_DAILY_LIMIT when it is a positive integer', async () => {
    process.env.AI_DAILY_LIMIT = '5';
    await callAi();
    expect(mockQuota.calls[0][1].p_daily_limit).toBe(5);
  });

  it.each(['0', '-3', '2.5', 'abc', ''])('falls back to 50 when AI_DAILY_LIMIT is %p', async (value) => {
    process.env.AI_DAILY_LIMIT = value;
    await callAi();
    expect(mockQuota.calls[0][1].p_daily_limit).toBe(50);
  });

  it('returns 429 with seconds until UTC midnight once the daily limit is reached', async () => {
    process.env.AI_DAILY_LIMIT = '7';
    mockQuota.data = null;
    jest.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 10, 17, 23, 59, 30));
    const res = await callAi();
    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBe('30');
    expect(res.body).toEqual({ error: 'Daily AI limit of 7 requests reached. It resets at midnight UTC.' });
  });

  it('fails closed with 503 and logs only the message when the counter cannot be updated', async () => {
    mockQuota.data = null;
    mockQuota.error = { message: 'SECRET db failure', details: 'SECRET row' };
    const res = await callAi();
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'AI is unavailable right now, try again later' });
    expect(console.error).toHaveBeenCalledWith('AI quota check failed:', 'SECRET db failure');
  });
});
