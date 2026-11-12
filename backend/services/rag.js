const axios = require('axios');
const { generateJson } = require('../lib/gemini');
const { githubHeaders, GITHUB_TIMEOUT_MS } = require('../lib/github');

const MAX_REPO_PATHS = 2000;

const githubGet = (path) =>
  axios.get(`https://api.github.com${path}`, { headers: githubHeaders(), timeout: GITHUB_TIMEOUT_MS });

const fetchRepoPaths = async (repoName) => {
  try {
    const { data } = await githubGet(`/repos/${repoName}/git/trees/HEAD?recursive=1`);
    return data.tree
      .filter((entry) => entry.type === 'blob')
      .map((entry) => entry.path)
      .slice(0, MAX_REPO_PATHS);
  } catch (err) {
    console.error(`Repo tree fetch failed for ${repoName}:`, err.message);
    return null;
  }
};

const analyzeIssueContext = async (issueBody, repoName) => {
  // Edge Case (Empty Issue Context):
  if (!issueBody || issueBody.trim().length === 0) {
    return { suggested_files: [] };
  }

  try {
    const repoPaths = repoName ? await fetchRepoPaths(repoName) : null;
    const systemPrompt = `Analyze the issue body and return a JSON array of suggested files to check. Format: {"suggested_files": ["file1.js", "file2.js"]}`;
    const issueText = issueBody.substring(0, 5000); // Protect against token limit

    if (!repoPaths) {
      return await generateJson(systemPrompt, issueText);
    }

    const result = await generateJson(
      `${systemPrompt}. Only suggest paths that appear verbatim in the repository file list.`,
      `Issue body:\n${issueText}\n\nRepository files:\n${repoPaths.join('\n')}`
    );
    const knownPaths = new Set(repoPaths);
    const suggested = Array.isArray(result.suggested_files) ? result.suggested_files : [];
    return { suggested_files: suggested.filter((path) => knownPaths.has(path)) };
  } catch (err) {
    console.error("RAG error:", err);
    return { suggested_files: [] };
  }
};

module.exports = { analyzeIssueContext };
