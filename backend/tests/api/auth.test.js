const request = require('supertest');
const express = require('express');

process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_ANON_KEY = 'anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';

const mockState = {
  issuedTokens: new Map(),
  revokedTokens: new Set(),
  loginError: null,
  signUpResult: null,
  signInCalls: 0,
  signUpCalls: 0,
  adminSignOutCalls: [],
};

const resetState = () => {
  mockState.issuedTokens = new Map();
  mockState.revokedTokens = new Set();
  mockState.loginError = null;
  mockState.signUpResult = null;
  mockState.signInCalls = 0;
  mockState.signUpCalls = 0;
  mockState.adminSignOutCalls = [];
};

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn((url, key) => {
    if (key === 'service-key') {
      return {
        auth: {
          getUser: (token) => {
            const email = mockState.issuedTokens.get(token);
            if (!email || mockState.revokedTokens.has(token)) {
              return Promise.resolve({ data: { user: null }, error: { message: 'invalid jwt' } });
            }
            return Promise.resolve({ data: { user: { id: email, email } }, error: null });
          },
          admin: {
            signOut: (token, scope) => {
              mockState.adminSignOutCalls.push({ token, scope });
              mockState.revokedTokens.add(token);
              return Promise.resolve({ data: null, error: null });
            },
          },
        },
      };
    }
    return {
      auth: {
        signInWithPassword: ({ email }) => {
          mockState.signInCalls += 1;
          if (mockState.loginError) return Promise.resolve({ data: {}, error: mockState.loginError });
          const token = `token-${email}-${mockState.issuedTokens.size}`;
          mockState.issuedTokens.set(token, email);
          return Promise.resolve({
            data: { session: { access_token: token }, user: { id: email, email } },
            error: null,
          });
        },
        signUp: () => {
          mockState.signUpCalls += 1;
          return Promise.resolve(mockState.signUpResult);
        },
      },
    };
  }),
}));

const { createClient } = require('@supabase/supabase-js');
const authRouter = require('../../routes/auth');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  return app;
};

const login = (app, email, password = 'secret1') =>
  request(app).post('/api/auth/login').send({ email, password });

const logout = (app, token) => {
  const req = request(app).post('/api/auth/logout');
  if (token) req.set('Authorization', `Bearer ${token}`);
  return req;
};

const anonClientCalls = () => createClient.mock.calls.filter(([, key]) => key === 'anon-key');

beforeEach(() => {
  resetState();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('POST /api/auth/logout', () => {
  it('logging out user A leaves user B signed in and invalidates only A', async () => {
    const app = buildApp();
    const tokenA = (await login(app, 'a@example.com')).body.session.access_token;
    const tokenB = (await login(app, 'b@example.com')).body.session.access_token;

    expect((await logout(app, tokenA)).status).toBe(200);
    expect((await logout(app, tokenA)).status).toBe(401);

    const resB = await logout(app, tokenB);
    expect(resB.status).toBe(200);
    expect(resB.body).toEqual({ message: 'Logged out successfully' });
  });

  it('rejects a request with no Authorization header and never signs anyone out', async () => {
    const app = buildApp();
    await login(app, 'a@example.com');

    const res = await logout(app, null);
    expect(res.status).toBe(401);
    expect(mockState.adminSignOutCalls).toEqual([]);
  });

  it('signs out only the presented session with local scope', async () => {
    const app = buildApp();
    const token = (await login(app, 'a@example.com')).body.session.access_token;

    await logout(app, token);
    expect(mockState.adminSignOutCalls).toEqual([{ token, scope: 'local' }]);
  });
});

describe('POST /api/auth/login', () => {
  it('builds a fresh non-persisting Supabase client for every request', async () => {
    const app = buildApp();
    await login(app, 'a@example.com');
    await login(app, 'b@example.com');

    const calls = anonClientCalls();
    expect(calls).toHaveLength(2);
    for (const [, , options] of calls) {
      expect(options.auth).toEqual({ persistSession: false, autoRefreshToken: false });
    }
  });
});
