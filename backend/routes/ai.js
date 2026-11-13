const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const { ingestIssues } = require('../cron/ingestIssues');

// Manually trigger ingestion. This kicks off an expensive job (GitHub +
// Gemini calls), so it now requires a valid authenticated session rather
// than being open to the world.
router.post('/trigger-ingestion', requireAuth, async (req, res) => {
  ingestIssues().catch((err) => console.error('Manual ingestion failed:', err.message));
  res.json({ message: 'Ingestion started' });
});

module.exports = router;
