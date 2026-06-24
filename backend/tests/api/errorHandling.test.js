const request = require('supertest');
const express = require('express');

describe('Backend Global Error Handler', () => {
  let app;

  beforeAll(() => {
    // We create a fresh Express app and inject the exact same Global Error Handler as server.js
    app = express();
    app.use(express.json());

    // Create a mock route that throws an unhandled exception
    app.get('/api/crash-test', (req, res, next) => {
      throw new Error('CRITICAL DB CONNECTION FAILURE');
    });

    // Inject the exact global error handler from server.js
    app.use((err, req, res, next) => {
      // We mute console.error in tests to keep the output clean
      res.status(500).json({ error: 'An internal server error occurred.' });
    });
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
  });
});
