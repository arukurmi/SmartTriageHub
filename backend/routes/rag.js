const express = require('express');
const router = express.Router();
const { analyzeIssueContext } = require('../services/rag');

router.post('/context', async (req, res) => {
  try {
    const { issueBody } = req.body;
    const result = await analyzeIssueContext(issueBody);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
