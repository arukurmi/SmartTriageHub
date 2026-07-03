const request = require('supertest');
const express = require('express');

process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';

// Controllable Supabase mock for the profile-linking endpoint.
const state = {
  user: null, // user returned by auth.getUser
  authError: null,
  updateResult: { data: { id: 'u1', github_username: 'octocat' }, error: null },
  lastUpdate: null, // { payload, filters }
};

const resetState = () => {
  state.user = { id: 'u1', email: 'dev@example.com' };
  state.authError = null;
  state.updateResult = { data: { id: 'u1', github_username: 'octocat' }, error: null };
  state.lastUpdate = null;
};

jest.mock('@supabase/supabase-js', () => {
  const makeBuilder = () => {
    const ops = { payload: null, filters: {} };
    const builder = {
      update(v) { ops.payload = v; return builder; },
      eq(col, val) { ops.filters[col] = val; return builder; },
      select() { return builder; },
      single() {
        state.lastUpdate = { payload: ops.payload, filters: ops.filters };
        return Promise.resolve(state.updateResult);
      },
    };
    return builder;
  };

  return {
    createClient: jest.fn(() => ({
      from: () => makeBuilder(),
      auth: {
        getUser: jest.fn(() =>
          Promise.resolve({ data: { user: state.user }, error: state.authError })
        ),
      },
    })),
  };
});

const profileRouter = require('../../routes/profile');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/profile', profileRouter);
  return app;
};

const link = (app, username, { token = 'valid-token' } = {}) => {
  const req = request(app).put('/api/profile/github').set('Content-Type', 'application/json');
  if (token !== null) req.set('Authorization', `Bearer ${token}`);
  return req.send({ github_username: username });
};

beforeEach(() => {
  resetState();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('PUT /api/profile/github — auth', () => {
  it('rejects requests with no Authorization header (401)', async () => {
    const res = await link(buildApp(), 'octocat', { token: null });
    expect(res.status).toBe(401);
  });

  it('rejects an invalid/expired token (401)', async () => {
    state.user = null;
    state.authError = { message: 'bad jwt' };
    const res = await link(buildApp(), 'octocat');
    expect(res.status).toBe(401);
  });
});

describe('PUT /api/profile/github — validation', () => {
  it.each([
    ['empty', ''],
    ['leading hyphen', '-bad'],
    ['trailing hyphen', 'bad-'],
    ['consecutive hyphens', 'ba--d'],
    ['illegal chars', 'has space'],
    ['too long', 'a'.repeat(40)],
  ])('rejects an invalid username (%s) with 400', async (_label, username) => {
    const res = await link(buildApp(), username);
    expect(res.status).toBe(400);
    expect(state.lastUpdate).toBeNull(); // never touched the DB
  });
});

describe('PUT /api/profile/github — success & conflicts', () => {
  it('links the username to the authenticated user only (id from token, not body)', async () => {
    const res = await link(buildApp(), 'octocat');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ github_username: 'octocat' });
    expect(state.lastUpdate.payload).toEqual({ github_username: 'octocat' });
    expect(state.lastUpdate.filters).toEqual({ id: 'u1' });
  });

  it('trims surrounding whitespace before saving', async () => {
    await link(buildApp(), '  octocat  ');
    expect(state.lastUpdate.payload).toEqual({ github_username: 'octocat' });
  });

  it('returns 409 when the GitHub account is already linked to another user', async () => {
    state.updateResult = { data: null, error: { code: '23505', message: 'duplicate key' } };
    const res = await link(buildApp(), 'octocat');
    expect(res.status).toBe(409);
  });

  it('returns 500 on an unexpected DB error', async () => {
    state.updateResult = { data: null, error: { code: 'XXXXX', message: 'boom' } };
    const res = await link(buildApp(), 'octocat');
    expect(res.status).toBe(500);
  });
});
