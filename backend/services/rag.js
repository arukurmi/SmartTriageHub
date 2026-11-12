const { generateJson } = require('../lib/gemini');

const analyzeIssueContext = async (issueBody) => {
  // Edge Case (Empty Issue Context):
  if (!issueBody || issueBody.trim().length === 0) {
    return { suggested_files: [] };
  }

  try {
    const systemPrompt = `Analyze the issue body and return a JSON array of suggested files to check. Format: {"suggested_files": ["file1.js", "file2.js"]}`;
    return await generateJson(systemPrompt, issueBody.substring(0, 5000)); // Protect against token limit
  } catch (err) {
    console.error("RAG error:", err);
    return { suggested_files: [] };
  }
};

module.exports = { analyzeIssueContext };
