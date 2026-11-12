const request = require('supertest');
const express = require('express');
const securityHeaders = require('../../middleware/securityHeaders');

describe('securityHeaders middleware', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.disable('x-powered-by');
    app.use(securityHeaders);
    app.get('/ping', (req, res) => res.json({ ok: true }));
  });

  it('sets the hardening headers on every response', async () => {
    const res = await request(app).get('/ping');

    expect(res.status).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['strict-transport-security']).toMatch(/max-age=\d+/);
    expect(res.headers['permissions-policy']).toContain('camera=()');
  });

  it('does not advertise the framework via X-Powered-By', async () => {
    const res = await request(app).get('/ping');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
