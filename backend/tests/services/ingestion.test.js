const axios = require('axios');
const { ingestIssues, clampScore } = require('../../cron/ingestIssues');

// Mock dependencies
jest.mock('axios');

jest.mock('@supabase/supabase-js', () => {
  const mUpsert = jest.fn().mockResolvedValue({ error: null });
  return {
    createClient: jest.fn(() => ({
      from: jest.fn(() => ({
        upsert: mUpsert
      }))
    })),
    // Export the mock so we can assert on it later
    _mockUpsert: mUpsert 
  };
});

jest.mock('@google/genai', () => {
  const generateContent = jest.fn().mockResolvedValue({
    text: '{"score": 5, "summary": "Test summary"}'
  });
  return {
    GoogleGenAI: jest.fn().mockImplementation(() => ({
      models: { generateContent }
    })),
    _mockGenerateContent: generateContent
  };
});

const { createClient } = require('@supabase/supabase-js');
const mockSupabaseUpsert = require('@supabase/supabase-js')._mockUpsert;
const mockGenerateContent = require('@google/genai')._mockGenerateContent;

describe('DATA INGESTION CRON JOB TESTING', () => {
  jest.setTimeout(120000); // 120 seconds timeout

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('Happy Path: Mock GitHub returning 50 issues and verify mappings.', async () => {
    // Creating 50 mock issues (well, testing with 5 to respect our ISSUES_PER_LANGUAGE, or override it)
    const mockIssues = Array.from({ length: 5 }, (_, i) => ({
      id: i,
      title: `Issue ${i}`,
      body: `Body ${i}`,
      repository_url: 'https://api.github.com/repos/org/repo',
      html_url: `https://github.com/org/repo/issues/${i}`,
      labels: [{ name: 'good first issue' }, { name: 'docs' }],
      comments: 7,
      pull_request: null
    }));

    axios.get.mockResolvedValue({ data: { items: mockIssues } });

    // Assuming 5 languages * 5 issues = 25 total upserts expected
    await ingestIssues();

    expect(axios.get).toHaveBeenCalledTimes(5); // 5 languages
    expect(mockSupabaseUpsert).toHaveBeenCalledTimes(25);
    
    // Check mapping
    expect(mockSupabaseUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        github_issue_id: 0,
        repo_name: 'org/repo',
        title: 'Issue 0',
        body: 'Body 0',
        url: 'https://github.com/org/repo/issues/0'
      }),
      { onConflict: 'github_issue_id' }
    );
    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        contents: expect.stringMatching(/Labels: good first issue, docs[\s\S]*Comment count: 7/)
      })
    );
  });

  it('Edge Case (GitHub API Failure): Mock a 403 or 500 error and verify graceful termination.', async () => {
    axios.get.mockRejectedValue(new Error('Request failed with status code 403'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    // Should not throw, should gracefully catch
    await expect(ingestIssues()).resolves.not.toThrow();
    
    // Ensure it logged the error
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Error fetching issues for JavaScript:'),
      'Request failed with status code 403'
    );
    
    consoleSpy.mockRestore();
  });

  it('Edge Case (Duplicate Prevention): Ensure repository layer uses atomic upsert.', async () => {
    const mockIssues = [{
      id: 123,
      title: `Dup Issue`,
      repository_url: 'https://api.github.com/repos/org/repo',
      html_url: `https://github.com/org/repo/issues/123`,
      pull_request: null
    }];

    axios.get.mockResolvedValue({ data: { items: mockIssues } });

    await ingestIssues();

    // Verify upsert command was used with onConflict clause to prevent SQL constraint violations
    expect(mockSupabaseUpsert).toHaveBeenCalledWith(
      expect.any(Object),
      { onConflict: 'github_issue_id' }
    );
  });

  it('clampScore rounds into 1-10 and falls back to 5 for non-numeric scores', () => {
    expect(clampScore(7)).toBe(7);
    expect(clampScore(6.6)).toBe(7);
    expect(clampScore('4')).toBe(4);
    expect(clampScore(0)).toBe(1);
    expect(clampScore(-3)).toBe(1);
    expect(clampScore(42)).toBe(10);
    expect(clampScore(undefined)).toBe(5);
    expect(clampScore(null)).toBe(5);
    expect(clampScore('hard')).toBe(5);
  });
});
