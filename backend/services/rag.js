const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const analyzeIssueContext = async (issueBody) => {
  // Edge Case (Empty Issue Context):
  if (!issueBody || issueBody.trim().length === 0) {
    return { suggested_files: [] };
  }

  // Real implementation would call Gemini here to map context
  try {
    const systemPrompt = `Analyze the issue body and return a JSON array of suggested files to check. Format: {"suggested_files": ["file1.js", "file2.js"]}`;
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: issueBody.substring(0, 5000), // Protect against token limit
      config: { systemInstruction: systemPrompt }
    });
    
    let aiText = response.text;
    if (aiText.startsWith('```json')) {
      aiText = aiText.replace(/```json/g, '').replace(/```/g, '').trim();
    }
    
    return JSON.parse(aiText);
  } catch (err) {
    console.error("RAG error:", err);
    return { suggested_files: [] };
  }
};

module.exports = { analyzeIssueContext };
