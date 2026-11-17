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
    .select('id, title, body, repo_name, github_issue_number, updated_at')
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

/** A cache read failure only costs a fresh generation, so it is logged and never fails the request. */
const serveCachedInsight = (kind) => async (req, res, next) => {
  if (req.body.refresh === true) return next();

  const { data: cached, error } = await supabase
    .from('issue_ai_insights')
    .select('result, generated_at')
    .eq('issue_id', req.issue.id)
    .eq('kind', kind)
    .eq('issue_updated_at', req.issue.updated_at)
    .maybeSingle();

  if (error) console.error('AI insight cache read failed:', error.message);
  if (!cached) return next();
  res.json({ ...cached.result, cached: true, generated_at: cached.generated_at });
};

/** An empty list is not cached: analyzeIssueContext returns one when Gemini fails. */
const sendFreshInsight = async (req, res, kind, result, listKey) => {
  const generatedAt = new Date().toISOString();
  if (Array.isArray(result[listKey]) && result[listKey].length > 0) {
    const { error } = await supabase.from('issue_ai_insights').upsert(
      {
        issue_id: req.issue.id,
        kind,
        result,
        issue_updated_at: req.issue.updated_at,
        generated_at: generatedAt,
      },
      { onConflict: 'issue_id,kind' }
    );
    if (error) console.error('AI insight cache write failed:', error.message);
  }
  res.json({ ...result, cached: false, generated_at: generatedAt });
};

router.post('/context', loadIssue, serveCachedInsight('context'), aiQuota, async (req, res) => {
  try {
    const result = await analyzeIssueContext(req.issue);
    await sendFreshInsight(req, res, 'context', result, 'suggested_files');
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
  serveCachedInsight('thread_summary'),
  aiQuota,
  async (req, res) => {
    try {
      const result = await summarizeThread(req.issue.repo_name, req.issue.github_issue_number);
      await sendFreshInsight(req, res, 'thread_summary', result, 'steps');
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
