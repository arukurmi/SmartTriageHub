const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabaseAdmin');
const requireAuth = require('../middleware/requireAuth');
const aiQuota = require('../middleware/aiQuota');
const { analyzeIssueContext, summarizeThread } = require('../services/rag');

router.use(requireAuth);

const isIssueId = (value) =>
  (typeof value === 'string' && value.trim().length > 0 && value.length <= 64) ||
  (Number.isInteger(value) && value > 0);

const loadIssue = async (req, res, next) => {
  const { issueId } = req.body || {};
  if (!isIssueId(issueId)) {
    return res.status(400).json({ error: 'issueId is required' });
  }

  const { data: issue, error } = await supabase
    .from('issues')
    .select('id, title, body, repo_name, github_issue_number')
    .eq('id', issueId)
    .maybeSingle();

  if (error) {
    console.error('Issue lookup failed:', error.message);
    return res.status(500).json({ error: 'Could not load issue' });
  }
  if (!issue) {
    return res.status(404).json({ error: 'Issue not found' });
  }
  req.issue = issue;
  next();
};

const requireGithubIssueNumber = (req, res, next) => {
  if (!req.issue.github_issue_number) {
    return res.status(404).json({ error: 'Issue has no GitHub issue number' });
  }
  next();
};

router.post('/context', loadIssue, aiQuota, async (req, res) => {
  try {
    const result = await analyzeIssueContext(req.issue);
    res.json(result);
  } catch (error) {
    // Don't leak internal error details (stack, provider messages) to callers.
    console.error('RAG context analysis failed:', error.message || error);
    res.status(500).json({ error: 'Could not analyze issue context' });
  }
});

router.post(
  '/thread-summary',
  loadIssue,
  requireGithubIssueNumber,
  aiQuota,
  async (req, res) => {
    try {
      res.json(await summarizeThread(req.issue.repo_name, req.issue.github_issue_number));
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
  }
);

module.exports = router;
