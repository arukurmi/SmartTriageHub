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
});
