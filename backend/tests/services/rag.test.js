const { analyzeIssueContext } = require('../../services/rag');

// We don't need to deeply mock Gemini here if we test the short-circuit condition,
// but we mock it just in case the real call triggers.
jest.mock('@google/genai', () => {
  return {
    GoogleGenAI: jest.fn().mockImplementation(() => ({
      models: {
        generateContent: jest.fn().mockRejectedValue(new Error('Should not be called!'))
      }
    }))
  };
});

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
});
