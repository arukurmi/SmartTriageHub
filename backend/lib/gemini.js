const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

/** The model sometimes wraps its JSON in fences or prose, so parse the outermost {...} span. */
const generateJson = async (systemInstruction, contents) => {
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents,
    config: { systemInstruction, responseMimeType: 'application/json' },
  });
  const match = (response.text || '').match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Gemini response contained no JSON object');
  return JSON.parse(match[0]);
};

module.exports = { generateJson };
