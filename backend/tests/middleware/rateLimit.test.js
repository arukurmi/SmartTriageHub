const request = require('supertest');
const app = require('../../server'); // Import the express app without starting the server

// Mock Supabase to prevent actual network calls during auth route testing
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: {
      signInWithOtp: jest.fn().mockResolvedValue({ data: {}, error: null }),
      signUp: jest.fn().mockResolvedValue({ data: { user: {}, session: {} }, error: null }),
      signInWithPassword: jest.fn().mockResolvedValue({ data: { user: {}, session: {} }, error: null })
    }
  }))
}));

// Mock the ingestion cron job to prevent real execution
jest.mock('../../cron/ingestIssues', () => ({
  startIngestionCron: jest.fn(),
  ingestIssues: jest.fn().mockResolvedValue()
}));

// Mock the RAG service
jest.mock('../../services/rag', () => ({
  analyzeIssueContext: jest.fn().mockResolvedValue({ suggested_files: [] })
}));

describe('RATE LIMITING MIDDLEWARE TESTING', () => {
  beforeEach(() => {
    // Reset rate limits by clearing express-rate-limit internal store? 
    // Usually supertest keeps the app instance alive, so rate limits persist across tests.
    // To isolate, we might need to reset the timer or re-import the app, but jest.resetModules() works best.
    jest.resetModules();
  });

  afterAll(() => {
    jest.clearAllMocks();
  });

  it('Happy Path: Ensure consecutive requests within the allowed limits return 200 OK', async () => {
    const FreshApp = require('../../server');
    for (let i = 0; i < 5; i++) {
      const res = await request(FreshApp)
        .post('/api/auth/signup')
        .send({ email: 'test@example.com', password: 'testpassword' });
      expect(res.statusCode).toBe(200);
    }
  });

  it('Edge Case (Auth Burst): Simulate 6 rapid requests to auth route. Assert 6th fails with 429.', async () => {
    const FreshApp = require('../../server');
    // First 5 should pass
    for (let i = 0; i < 5; i++) {
      await request(FreshApp).post('/api/auth/signup').send({ email: 'test@example.com', password: 'testpassword' });
    }
    // 6th should fail with 429
    const res = await request(FreshApp)
      .post('/api/auth/signup')
      .send({ email: 'test@example.com', password: 'testpassword' });
    
    expect(res.statusCode).toBe(429);
    expect(res.text).toMatch(/Too many authentication attempts/);
  });

  it('Edge Case (AI Burst): Simulate 11 rapid requests to AI route. Assert 11th triggers HTTP 429.', async () => {
    const FreshApp = require('../../server');
    // First 10 should pass (we use the RAG context route to simulate an AI route)
    for (let i = 0; i < 10; i++) {
      await request(FreshApp).post('/api/rag/context').send({ issueBody: 'test' });
    }
    // 11th should fail with 429
    const res = await request(FreshApp)
      .post('/api/rag/context')
      .send({ issueBody: 'test' });
    
    expect(res.statusCode).toBe(429);
    expect(res.text).toMatch(/Too many AI requests/);
  });

  it('Boundary: Test that rate limits properly reset after the timeout window expires.', async () => {
    jest.useFakeTimers();
    const FreshApp = require('../../server');
    
    // Exhaust the limit
    for (let i = 0; i < 5; i++) {
      await request(FreshApp).post('/api/auth/signup').send({ email: 'test@example.com', password: 'testpassword' });
    }
    let res = await request(FreshApp).post('/api/auth/signup').send({ email: 'test@example.com', password: 'testpassword' });
    expect(res.statusCode).toBe(429);

    // Fast-forward time by 16 minutes
    jest.advanceTimersByTime(16 * 60 * 1000);

    // Should work again
    res = await request(FreshApp).post('/api/auth/signup').send({ email: 'test@example.com', password: 'testpassword' });
    expect(res.statusCode).toBe(200);
    
    jest.useRealTimers();
  });
});
