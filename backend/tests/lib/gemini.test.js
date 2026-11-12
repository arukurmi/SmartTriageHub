jest.mock('@google/genai', () => {
  const generateContent = jest.fn();
  return {
    GoogleGenAI: jest.fn().mockImplementation(() => ({ models: { generateContent } })),
    _mockGenerateContent: generateContent,
  };
});

const { generateJson } = require('../../lib/gemini');
const mockGenerateContent = require('@google/genai')._mockGenerateContent;

describe('generateJson', () => {
  it('parses a plain JSON response and sends the system instruction to gemini-2.5-flash', async () => {
    mockGenerateContent.mockResolvedValue({ text: '{"score": 3, "summary": "ok"}' });

    await expect(generateJson('be a triager', 'issue text')).resolves.toEqual({ score: 3, summary: 'ok' });
    expect(mockGenerateContent).toHaveBeenCalledWith({
      model: 'gemini-2.5-flash',
      contents: 'issue text',
      config: expect.objectContaining({ systemInstruction: 'be a triager' }),
    });
  });

  it('parses JSON wrapped in a markdown fence', async () => {
    mockGenerateContent.mockResolvedValue({ text: '```json\n{"steps": ["a", "b"]}\n```' });

    await expect(generateJson('sys', 'text')).resolves.toEqual({ steps: ['a', 'b'] });
  });

  it('parses JSON surrounded by prose', async () => {
    mockGenerateContent.mockResolvedValue({
      text: 'Here is the analysis:\n{"score": 8, "summary": "Bug fix"}\nHope this helps!',
    });

    await expect(generateJson('sys', 'text')).resolves.toEqual({ score: 8, summary: 'Bug fix' });
  });

  it('throws when the response contains no JSON object', async () => {
    mockGenerateContent.mockResolvedValue({ text: 'I cannot provide a score for this.' });

    await expect(generateJson('sys', 'text')).rejects.toThrow('no JSON object');
  });
});
