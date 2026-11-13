const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const requireAdmin = require('../middleware/requireAdmin');
const { ingestIssues } = require('../cron/ingestIssues');

let ingestionRunning = false;

router.post('/trigger-ingestion', requireAuth, requireAdmin, async (req, res) => {
  if (ingestionRunning) {
    return res.status(409).json({ error: 'Ingestion already running' });
  }
  ingestionRunning = true;
  ingestIssues()
    .catch((err) => console.error('Manual ingestion failed:', err.message))
    .finally(() => {
      ingestionRunning = false;
    });
  res.json({ message: 'Ingestion started' });
});

module.exports = router;
