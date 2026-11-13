const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const requireAdmin = require('../middleware/requireAdmin');
const { ingestIssues } = require('../cron/ingestIssues');

router.post('/trigger-ingestion', requireAuth, requireAdmin, async (req, res) => {
  ingestIssues().catch((err) => console.error('Manual ingestion failed:', err.message));
  res.json({ message: 'Ingestion started' });
});

module.exports = router;
