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

const githubIdentity = (userName) => ({ provider: 'github', identity_data: { user_name: userName } });

const resetState = () => {
  state.user = { id: 'u1', email: 'dev@example.com', identities: [githubIdentity('octocat')] };
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

jest.mock('../../services/githubSync', () => ({
  syncMergedPrsForProfile: jest.fn(() => Promise.resolve({ newlyCredited: 0 })),
}));

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

describe('PUT /api/profile/github — verified identity', () => {
  it('rejects a user with no GitHub identity (403) without touching the DB', async () => {
    state.user.identities = [{ provider: 'email', identity_data: {} }];
    const res = await link(buildApp(), 'octocat');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Sign in with GitHub to link your account' });
    expect(state.lastUpdate).toBeNull();
  });

  it('ignores a user-editable user_metadata.user_name', async () => {
    state.user.identities = [];
    state.user.user_metadata = { user_name: 'octocat' };
    const res = await link(buildApp(), 'octocat');
    expect(res.status).toBe(403);
    expect(state.lastUpdate).toBeNull();
  });

  it('rejects a body username that differs from the verified one (403)', async () => {
    const res = await link(buildApp(), 'someone-else');
    expect(res.status).toBe(403);
    expect(state.lastUpdate).toBeNull();
  });

  it('accepts a body username that matches case-insensitively and saves the verified one', async () => {
    const res = await link(buildApp(), 'OctoCat');
    expect(res.status).toBe(200);
    expect(state.lastUpdate.payload).toEqual({ github_username: 'octocat' });
  });

  it('links the verified username when the body has none', async () => {
    const res = await link(buildApp(), undefined);
    expect(res.status).toBe(200);
    expect(state.lastUpdate.payload).toEqual({ github_username: 'octocat' });
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

describe('POST /api/profile/sync-github — per-user cooldown', () => {
  const sync = (app) =>
    request(app).post('/api/profile/sync-github').set('Authorization', 'Bearer valid-token');

  it('rejects a second sync within a minute with 429 and Retry-After', async () => {
    state.user.id = 'sync-cooldown-user';
    const app = buildApp();
    expect((await sync(app)).status).toBe(200);

    const res = await sync(app);
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: 'You can sync once a minute. Try again shortly.' });
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('does not block a different user', async () => {
    const app = buildApp();
    state.user.id = 'sync-first-user';
    await sync(app);

    state.user.id = 'sync-second-user';
    expect((await sync(app)).status).toBe(200);
  });
});
