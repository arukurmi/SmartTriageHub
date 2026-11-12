const express = require('express');
const router = express.Router();
const { analyzeIssueContext, summarizeThread } = require('../services/rag');

// Reject payloads larger than this before we spend anything on the model.
// The service already truncates to 5k chars, but validating up front returns
// a clear 400 instead of silently trimming a suspiciously large request.
const MAX_ISSUE_BODY_LENGTH = 20000;

const isRepoName = (value) => typeof value === 'string' && /^(?!\.+\/)[\w.-]+\/(?!\.+$)[\w.-]+$/.test(value);

router.post('/context', async (req, res) => {
  const { issueBody, repoName } = req.body || {};

  if (typeof issueBody !== 'string') {
    return res.status(400).json({ error: 'issueBody must be a string' });
  }
  if (issueBody.length > MAX_ISSUE_BODY_LENGTH) {
    return res
      .status(413)
      .json({ error: `issueBody must be at most ${MAX_ISSUE_BODY_LENGTH} characters` });
  }
  if (repoName != null && !isRepoName(repoName)) {
    return res.status(400).json({ error: 'repoName must look like owner/repo' });
  }

  try {
    const result = await analyzeIssueContext(issueBody, repoName);
    res.json(result);
  } catch (error) {
    // Don't leak internal error details (stack, provider messages) to callers.
    console.error('RAG context analysis failed:', error.message || error);
    res.status(500).json({ error: 'Could not analyze issue context' });
  }
});

router.post('/thread-summary', async (req, res) => {
  const { repoName, issueNumber } = req.body || {};

  if (!isRepoName(repoName)) {
    return res.status(400).json({ error: 'repoName must look like owner/repo' });
  }
  if (!Number.isInteger(issueNumber) || issueNumber < 1) {
    return res.status(400).json({ error: 'issueNumber must be a positive integer' });
  }

  try {
    res.json(await summarizeThread(repoName, issueNumber));
  } catch (error) {
    const githubStatus = error.response?.status;
    if (githubStatus === 404) {
      return res.status(404).json({ error: 'Issue not found on GitHub' });
    }
    if ([403, 429].includes(githubStatus)) {
      return res.status(429).json({ error: 'GitHub rate limit hit, try again shortly' });
    }
    console.error('Thread summary failed:', error.message || error);
    res.status(500).json({ error: 'Could not summarize issue thread' });
  }
});

module.exports = router;
