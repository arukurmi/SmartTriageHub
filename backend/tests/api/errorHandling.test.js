const request = require('supertest');
const express = require('express');
const errorHandler = require('../../middleware/errorHandler');

describe('Backend Global Error Handler', () => {
  let app;
  let consoleSpy;

  beforeAll(() => {
    app = express();
    app.use(express.json());

    // Create a mock route that throws an unhandled exception
    app.get('/api/crash-test', (req, res, next) => {
      throw new Error('CRITICAL DB CONNECTION FAILURE');
    });

    app.get('/api/exposed-client-error', () => {
      throw Object.assign(new Error('Origin not allowed'), { status: 403, expose: true });
    });

    app.get('/api/unexposed-client-error', () => {
      throw Object.assign(new Error('SECRET lookup detail'), { status: 404 });
    });

    app.use(errorHandler);
  });

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('guarantees that unhandled crashes return a safe, generic JSON response instead of an HTML stack trace', async () => {
    const response = await request(app).get('/api/crash-test');

    // It MUST return 500
    expect(response.status).toBe(500);

    // It MUST return JSON
    expect(response.headers['content-type']).toMatch(/application\/json/);

    // It MUST NOT leak the actual raw error message
    expect(response.body).not.toHaveProperty('message', 'CRITICAL DB CONNECTION FAILURE');
    expect(response.text).not.toContain('CRITICAL DB CONNECTION FAILURE');

    // It MUST return the generic, user-safe error response
    expect(response.body).toEqual({ error: 'An internal server error occurred.' });
    expect(consoleSpy).toHaveBeenCalledWith('Unhandled Server Error:', 'CRITICAL DB CONNECTION FAILURE');
  });

  it('passes an exposed 4xx through with its status and message', async () => {
    const response = await request(app).get('/api/exposed-client-error');

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Origin not allowed' });
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('returns 400 for a malformed JSON body', async () => {
    const response = await request(app)
      .post('/api/anything')
      .set('Content-Type', 'application/json')
      .send('{"broken":');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: expect.any(String) });
  });

  it('hides a 4xx that is not flagged expose behind the generic 500', async () => {
    const response = await request(app).get('/api/unexposed-client-error');

    expect(response.status).toBe(500);
    expect(response.text).not.toContain('SECRET lookup detail');
    expect(response.body).toEqual({ error: 'An internal server error occurred.' });
  });
});
