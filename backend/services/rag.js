const axios = require('axios');
const { generateJson } = require('../lib/gemini');
const { githubHeaders, GITHUB_TIMEOUT_MS } = require('../lib/github');

const MAX_REPO_PATHS = 2000;
const MAX_THREAD_CHARS = 15000;

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

const summarizeThread = async (repoName, issueNumber) => {
  const [{ data: issue }, { data: comments }] = await Promise.all([
    githubGet(`/repos/${repoName}/issues/${issueNumber}`),
    githubGet(`/repos/${repoName}/issues/${issueNumber}/comments?per_page=100`),
  ]);

  const thread = [
    `Title: ${issue.title}`,
    `Body: ${issue.body || 'No body provided.'}`,
    ...comments.map((comment) => `${comment.user?.login || 'unknown'}: ${comment.body || ''}`),
  ]
    .join('\n\n')
    .substring(0, MAX_THREAD_CHARS);

  const result = await generateJson(
    'Read this GitHub issue thread and return a minified JSON object {"steps": ["..."]} listing 3 to 7 short, concrete steps a new contributor should follow to resolve it. Each step is one plain sentence without numbering.',
    thread
  );
  const steps = Array.isArray(result.steps) ? result.steps : [];
  return { steps: steps.filter((step) => typeof step === 'string') };
};

module.exports = { analyzeIssueContext, summarizeThread };
