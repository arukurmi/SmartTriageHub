const crypto = require('crypto');
const request = require('supertest');
const express = require('express');

// --- Environment must be set before the router is required (it builds a
//     Supabase client and reads the secret at module load time). ---
process.env.GITHUB_WEBHOOK_SECRET = 'test-webhook-secret';
process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';

// --- Controllable Supabase mock -------------------------------------------
// `state` lets each test stage what the DB returns and inspect what was written.
const mockState = {
  seenDeliveries: new Set(), // delivery ids already recorded -> duplicate
  insertError: null, // error returned by webhook_deliveries.insert
  profiles: [], // rows returned by the profiles lookup
  profileError: null,
  issues: [], // rows returned by the issues lookup
  rpcError: null, // error returned by record_contribution
  rpcCalls: [], // recorded record_contribution invocations
  deletedIssueIds: [], // issue ids deleted from the board
  seenContributions: new Set(), // mirrors the (user_id, repo_name, pr_number) unique key
};

const resetState = () => {
  mockState.seenDeliveries = new Set();
  mockState.insertError = null;
  mockState.profiles = [];
  mockState.profileError = null;
  mockState.issues = [];
  mockState.rpcError = null;
  mockState.rpcCalls = [];
  mockState.deletedIssueIds = [];
  mockState.seenContributions = new Set();
};

jest.mock('@supabase/supabase-js', () => {
  const makeBuilder = (table) => {
    const ops = { table, method: null, filters: {}, payload: null };
    const builder = {
      insert(v) { ops.method = 'insert'; ops.payload = v; return builder; },
      update(v) { ops.method = 'update'; ops.payload = v; return builder; },
      select() { if (!ops.method) ops.method = 'select'; return builder; },
      delete() { ops.method = 'delete'; return builder; },
      eq(col, val) { ops.filters[col] = val; return builder; },
      ilike(col, val) { ops.filters[col] = String(val).toLowerCase(); return builder; },
      then(resolve, reject) {
        return Promise.resolve(compute(ops)).then(resolve, reject);
      },
    };
    return builder;
  };

  const compute = (ops) => {
    if (ops.table === 'webhook_deliveries' && ops.method === 'insert') {
      const id = ops.payload.delivery_id;
      if (mockState.seenDeliveries.has(id)) {
        return { error: { code: '23505', message: 'duplicate key value' } };
      }
      mockState.seenDeliveries.add(id);
      return { error: mockState.insertError };
    }
    if (ops.table === 'profiles' && ops.method === 'select') {
      return { data: mockState.profiles, error: mockState.profileError };
    }
    if (ops.table === 'issues' && ops.method === 'select') {
      return { data: mockState.issues, error: null };
    }
    if (ops.table === 'issues' && ops.method === 'delete') {
      mockState.deletedIssueIds.push(ops.filters.id);
      return { error: null };
    }
    if (ops.table === 'contributions' && ops.method === 'insert') {
      const key = `${ops.payload.user_id}|${ops.payload.repo_name}|${ops.payload.pr_number}`;
      if (mockState.seenContributions.has(key)) {
        return { error: { code: '23505', message: 'duplicate key value' } };
      }
      mockState.seenContributions.add(key);
      return { error: null };
    }
    if (ops.table === 'contributions' && (ops.method === 'update' || ops.method === 'delete')) {
      return { error: null };
    }
    return { data: null, error: null };
  };

  return {
    createClient: jest.fn(() => ({
      from: (table) => makeBuilder(table),
      rpc: jest.fn((name, args) => {
        mockState.rpcCalls.push({ name, args });
        return Promise.resolve({ error: mockState.rpcError });
      }),
    })),
  };
});

const webhookRouter = require('../../routes/webhooks');

// Build an app that mounts the router exactly like server.js does (raw body).
const buildApp = () => {
  const app = express();
  app.use('/api/webhooks', express.raw({ type: 'application/json' }), webhookRouter);
  return app;
};

const sign = (body, secret = process.env.GITHUB_WEBHOOK_SECRET) =>
  `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;

const mergedPrPayload = ({ pull_request: prOverrides, ...overrides } = {}) => ({
  action: 'closed',
  pull_request: {
    number: 7,
    merged: true,
    merged_at: '2026-07-01T12:00:00Z',
    user: { login: 'octocat' },
    title: 'Fix the thing',
    html_url: 'https://github.com/org/repo/pull/7',
    body: 'This fixes #123 nicely.',
    ...prOverrides,
  },
  repository: { full_name: 'org/repo' },
  ...overrides,
});

const postWebhook = (app, payloadObj, { event = 'pull_request', delivery = 'd-1', signature } = {}) => {
  const body = JSON.stringify(payloadObj);
  const sig = signature === undefined ? sign(body) : signature;
  const req = request(app)
    .post('/api/webhooks/github')
    .set('Content-Type', 'application/json')
    .set('x-github-event', event)
    .set('x-github-delivery', delivery);
  if (sig !== null) req.set('x-hub-signature-256', sig);
  return req.send(body);
};

let consoleSpy;
beforeEach(() => {
  resetState();
  consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('GitHub webhook — signature verification', () => {
  it('rejects a request with no signature header (401)', async () => {
    const app = buildApp();
    const res = await postWebhook(app, mergedPrPayload(), { signature: null });
    expect(res.status).toBe(401);
  });

  it('rejects a tampered/invalid signature (401) and awards nothing', async () => {
    const app = buildApp();
    mockState.profiles = [{ id: 'u1', xp: 0, level: 1 }];
    const res = await postWebhook(app, mergedPrPayload(), { signature: 'sha256=deadbeef' });
    expect(res.status).toBe(401);
    expect(mockState.rpcCalls).toHaveLength(0);
  });

  it('rejects a signature computed with the wrong secret (401)', async () => {
    const app = buildApp();
    const body = JSON.stringify(mergedPrPayload());
    const res = await request(app)
      .post('/api/webhooks/github')
      .set('Content-Type', 'application/json')
      .set('x-github-event', 'pull_request')
      .set('x-github-delivery', 'd-1')
      .set('x-hub-signature-256', sign(body, 'the-wrong-secret'))
      .send(body);
    expect(res.status).toBe(401);
  });

  it('accepts a correctly signed payload (verified against the raw body)', async () => {
    const app = buildApp();
    const res = await postWebhook(app, mergedPrPayload());
    expect(res.status).toBe(200);
  });

  it('fails closed (500) when GITHUB_WEBHOOK_SECRET is not configured', async () => {
    const original = process.env.GITHUB_WEBHOOK_SECRET;
    delete process.env.GITHUB_WEBHOOK_SECRET;
    try {
      const app = buildApp();
      const res = await postWebhook(app, mergedPrPayload(), { signature: 'sha256=anything' });
      expect(res.status).toBe(500);
    } finally {
      process.env.GITHUB_WEBHOOK_SECRET = original;
    }
  });
});

describe('GitHub webhook — XP award flow', () => {
  it('awards XP scaled by the linked issue score and removes the issue', async () => {
    const app = buildApp();
    mockState.profiles = [{ id: 'u1', xp: 30, level: 1 }];
    mockState.issues = [{ id: 'issue-1', score: 6 }];

    const res = await postWebhook(app, mergedPrPayload());

    expect(res.status).toBe(200);
    expect(mockState.rpcCalls).toEqual([
      {
        name: 'record_contribution',
        args: { p_user_id: 'u1', p_xp_delta: 60, p_merged_date: '2026-07-01' },
      },
    ]);
    expect(mockState.deletedIssueIds).toEqual(['issue-1']);
  });

  it('awards the default XP when no matching issue is found', async () => {
    const app = buildApp();
    mockState.profiles = [{ id: 'u1', xp: 0, level: 1 }];
    mockState.issues = [];

    await postWebhook(app, mergedPrPayload());

    expect(mockState.rpcCalls[0].args.p_xp_delta).toBe(50);
    expect(mockState.deletedIssueIds).toEqual([]); // nothing to delete
  });

  it('does NOT delete the issue if the XP award fails', async () => {
    const app = buildApp();
    mockState.profiles = [{ id: 'u1', xp: 0, level: 1 }];
    mockState.issues = [{ id: 'issue-1', score: 5 }];
    mockState.rpcError = { message: 'rpc boom' };

    const res = await postWebhook(app, mergedPrPayload());

    expect(res.status).toBe(200); // still ack so GitHub doesn't hammer us
    expect(mockState.deletedIssueIds).toEqual([]);
  });

  it('awards nothing when no profile is linked to the GitHub user', async () => {
    const app = buildApp();
    mockState.profiles = []; // no linked profile

    const res = await postWebhook(app, mergedPrPayload());

    expect(res.status).toBe(200);
    expect(mockState.rpcCalls).toHaveLength(0);
  });

  it('awards the default XP when the PR body has no "Fixes #N" reference', async () => {
    const app = buildApp();
    mockState.profiles = [{ id: 'u1', xp: 0, level: 1 }];
    const payload = mergedPrPayload({ pull_request: { body: 'just a cleanup, no refs' } });

    await postWebhook(app, payload);

    expect(mockState.rpcCalls).toHaveLength(1);
    expect(mockState.rpcCalls[0].args.p_xp_delta).toBe(50);
    expect(mockState.deletedIssueIds).toEqual([]); // no issue referenced
  });
});

describe('GitHub webhook — event filtering & idempotency', () => {
  it('ignores pull requests that were closed but not merged', async () => {
    const app = buildApp();
    mockState.profiles = [{ id: 'u1', xp: 0, level: 1 }];
    const payload = mergedPrPayload({ pull_request: { merged: false } });

    const res = await postWebhook(app, payload);

    expect(res.status).toBe(200);
    expect(mockState.rpcCalls).toHaveLength(0);
  });

  it('ignores unrelated events (e.g. push)', async () => {
    const app = buildApp();
    mockState.profiles = [{ id: 'u1', xp: 0, level: 1 }];

    const res = await postWebhook(app, { ref: 'refs/heads/main' }, { event: 'push' });

    expect(res.status).toBe(200);
    expect(mockState.rpcCalls).toHaveLength(0);
  });

  it('replies to a ping event with pong (after signature check)', async () => {
    const app = buildApp();

    const res = await postWebhook(app, { zen: 'hi' }, { event: 'ping' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'pong' });
    expect(mockState.rpcCalls).toHaveLength(0);
  });

  it('processes a delivery once and ignores a redelivery with the same id', async () => {
    const app = buildApp();
    mockState.profiles = [{ id: 'u1', xp: 0, level: 1 }];
    mockState.issues = [{ id: 'issue-1', score: 5 }];

    const first = await postWebhook(app, mergedPrPayload(), { delivery: 'dup-1' });
    expect(first.status).toBe(200);
    expect(mockState.rpcCalls).toHaveLength(1);

    // GitHub redelivers the SAME delivery id; the issue is already gone.
    const second = await postWebhook(app, mergedPrPayload(), { delivery: 'dup-1' });
    expect(second.status).toBe(200);
    expect(mockState.rpcCalls).toHaveLength(1); // still only one award
  });

  it('rejects a body whose signature is valid but JSON is malformed (400)', async () => {
    const app = buildApp();
    const body = '{ not valid json';
    const res = await request(app)
      .post('/api/webhooks/github')
      .set('Content-Type', 'application/json')
      .set('x-github-event', 'pull_request')
      .set('x-github-delivery', 'd-1')
      .set('x-hub-signature-256', sign(body))
      .send(body);
    expect(res.status).toBe(400);
  });
});
