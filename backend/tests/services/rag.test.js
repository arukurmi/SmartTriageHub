const axios = require('axios');
const { analyzeIssueContext } = require('../../services/rag');

jest.mock('axios');

// We don't need to deeply mock Gemini here if we test the short-circuit condition,
// but we mock it just in case the real call triggers.
jest.mock('@google/genai', () => {
  const generateContent = jest.fn().mockRejectedValue(new Error('Should not be called!'));
  return {
    GoogleGenAI: jest.fn().mockImplementation(() => ({
      models: { generateContent }
    })),
    _mockGenerateContent: generateContent
  };
});

const mockGenerateContent = require('@google/genai')._mockGenerateContent;

describe('CODEBASE CONTEXT MICRO-RAG TESTING', () => {
  it('Edge Case (Empty Issue Context): Verify short-circuits to empty array without Gemini API call.', async () => {
    // Empty strings
    const result1 = await analyzeIssueContext('');
    expect(result1).toEqual({ suggested_files: [] });

    // Whitespace string
    const result2 = await analyzeIssueContext('   \n  ');
    expect(result2).toEqual({ suggested_files: [] });

    // Null/Undefined
    const result3 = await analyzeIssueContext(null);
    expect(result3).toEqual({ suggested_files: [] });

    // If it didn't short circuit, our mock would throw 'Should not be called!' and fail the test.
  });

  it('grounds suggestions in the repo tree and drops paths that do not exist', async () => {
    axios.get.mockResolvedValue({
      data: {
        tree: [
          { path: 'src', type: 'tree' },
          { path: 'src/auth/login.js', type: 'blob' },
          { path: 'README.md', type: 'blob' },
        ],
      },
    });
    mockGenerateContent.mockResolvedValueOnce({
      text: '{"suggested_files": ["src/auth/login.js", "src/auth/invented.js", "src"]}',
    });

    const result = await analyzeIssueContext('login is broken', 'org/repo');

    expect(result).toEqual({ suggested_files: ['src/auth/login.js'] });
    expect(axios.get).toHaveBeenCalledWith(
      'https://api.github.com/repos/org/repo/git/trees/HEAD?recursive=1',
      expect.objectContaining({ timeout: expect.any(Number) })
    );
    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({ contents: expect.stringContaining('src/auth/login.js\nREADME.md') })
    );
  });

  it('falls back to ungrounded suggestions when the repo tree fetch fails', async () => {
    axios.get.mockRejectedValue(new Error('Request failed with status code 404'));
    mockGenerateContent.mockResolvedValueOnce({ text: '{"suggested_files": ["guess.js"]}' });
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await analyzeIssueContext('login is broken', 'org/repo');

    expect(result).toEqual({ suggested_files: ['guess.js'] });
    consoleSpy.mockRestore();
  });

  it('skips the tree fetch when no repoName is given', async () => {
    mockGenerateContent.mockResolvedValueOnce({ text: '{"suggested_files": ["guess.js"]}' });

    await expect(analyzeIssueContext('login is broken')).resolves.toEqual({ suggested_files: ['guess.js'] });
    expect(axios.get).not.toHaveBeenCalled();
  });
});
