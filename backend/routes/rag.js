const express = require('express');
const router = express.Router();
const { analyzeIssueContext } = require('../services/rag');

// Reject payloads larger than this before we spend anything on the model.
// The service already truncates to 5k chars, but validating up front returns
// a clear 400 instead of silently trimming a suspiciously large request.
const MAX_ISSUE_BODY_LENGTH = 20000;

router.post('/context', async (req, res) => {
  const { issueBody } = req.body || {};

  if (typeof issueBody !== 'string') {
    return res.status(400).json({ error: 'issueBody must be a string' });
  }
  if (issueBody.length > MAX_ISSUE_BODY_LENGTH) {
    return res
      .status(413)
      .json({ error: `issueBody must be at most ${MAX_ISSUE_BODY_LENGTH} characters` });
  }

  try {
    const result = await analyzeIssueContext(issueBody);
    res.json(result);
  } catch (error) {
    // Don't leak internal error details (stack, provider messages) to callers.
    console.error('RAG context analysis failed:', error.message || error);
    res.status(500).json({ error: 'Could not analyze issue context' });
  }
});

module.exports = router;
