require('dotenv').config();
global.WebSocket = require('ws');
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const authRoutes = require('./routes/auth');
const aiRoutes = require('./routes/ai');
const { startIngestionCron } = require('./cron/ingestIssues');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Cron Job is started below if running as main module

// Setup rate limits
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: 'Too many authentication attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Limit each user IP to 10 requests per windowMs
  message: 'Too many AI requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Routes
const ragRoutes = require('./routes/rag');

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/ai', aiLimiter, aiRoutes);
app.use('/api/rag', aiLimiter, ragRoutes); // Using aiLimiter for RAG as well

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

if (require.main === module) {
  // Start Cron Job only when running directly
  startIngestionCron();
  app.listen(PORT, () => {
    console.log(`Backend server running on port ${PORT}`);
  });
}

module.exports = app;
