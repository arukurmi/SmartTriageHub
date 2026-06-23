const express = require('express');
const router = express.Router();
const { ingestIssues } = require('../cron/ingestIssues');

// Route to manually trigger ingestion for testing purposes
router.post('/trigger-ingestion', async (req, res) => {
  ingestIssues().catch(console.error);
  res.json({ message: 'Ingestion started' });
});

module.exports = router;
