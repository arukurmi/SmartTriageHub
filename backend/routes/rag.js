const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabaseAdmin');
const requireAuth = require('../middleware/requireAuth');
const { analyzeIssueContext, summarizeThread } = require('../services/rag');

router.use(requireAuth);

const isIssueId = (value) =>
  (typeof value === 'string' && value.trim().length > 0 && value.length <= 64) ||
  (Number.isInteger(value) && value > 0);

/** Sends the error response itself and returns null when the issue cannot be loaded. */
const loadIssue = async (req, res) => {
  const { issueId } = req.body || {};
  if (!isIssueId(issueId)) {
    res.status(400).json({ error: 'issueId is required' });
    return null;
  }

  const { data: issue, error } = await supabase
    .from('issues')
    .select('id, title, body, repo_name, github_issue_number')
    .eq('id', issueId)
    .maybeSingle();

  if (error) {
    console.error('Issue lookup failed:', error.message);
    res.status(500).json({ error: 'Could not load issue' });
    return null;
  }
  if (!issue) {
    res.status(404).json({ error: 'Issue not found' });
    return null;
  }
  return issue;
};

router.post('/context', async (req, res) => {
  const issue = await loadIssue(req, res);
  if (!issue) return;

  try {
    const result = await analyzeIssueContext(issue);
    res.json(result);
  } catch (error) {
    // Don't leak internal error details (stack, provider messages) to callers.
    console.error('RAG context analysis failed:', error.message || error);
    res.status(500).json({ error: 'Could not analyze issue context' });
  }
});

router.post('/thread-summary', async (req, res) => {
  const issue = await loadIssue(req, res);
  if (!issue) return;
  if (!issue.github_issue_number) {
    return res.status(404).json({ error: 'Issue has no GitHub issue number' });
  }

  try {
    res.json(await summarizeThread(issue.repo_name, issue.github_issue_number));
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
