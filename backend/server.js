require('dotenv').config();
global.WebSocket = require('ws');
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const authRoutes = require('./routes/auth');
const aiRoutes = require('./routes/ai');
const { startIngestionCron } = require('./cron/ingestIssues');
const { startSyncCron } = require('./cron/syncClosedIssues');
const { startMergedPrSyncCron } = require('./cron/syncMergedPrs');
const webhookRoutes = require('./routes/webhooks');

const securityHeaders = require('./middleware/securityHeaders');

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(securityHeaders);
const PORT = process.env.PORT || 5000;

// Restrict cross-origin access to an explicit allowlist. Origins are supplied
// via ALLOWED_ORIGINS (comma-separated); if unset we fall back to localhost so
// local dev keeps working. Requests without an Origin header (curl, server-to-
// server, health checks) are always allowed.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);

// GitHub webhooks must be verified against the RAW request body, so this route
// gets a raw-body parser and MUST be mounted before express.json() (which would
// otherwise consume and discard the raw bytes needed for HMAC verification).
app.use(
  '/api/webhooks',
  express.raw({ type: 'application/json', limit: '5mb' }),
  webhookRoutes
);

// Cap JSON bodies so a single request can't force us to buffer megabytes of
// input. 100kb is comfortably above any legitimate payload this API accepts.
app.use(express.json({ limit: '100kb' }));

// Cron Job is started below if running as main module

// Setup rate limits
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: { error: 'Too many authentication attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Limit each user IP to 10 requests per windowMs
  message: { error: 'Too many AI requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// A generous per-IP ceiling applied to every /api route as a catch-all, so any
// endpoint not covered by a stricter limiter (e.g. /api/profile) still can't be
// hammered. Webhooks are mounted above this and keep their own signature gate.
const globalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests/min/IP across the API surface
  message: { error: 'Too many requests, please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api', globalLimiter);

// Routes
const ragRoutes = require('./routes/rag');
const profileRoutes = require('./routes/profile');

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/ai', aiLimiter, aiRoutes);
app.use('/api/rag', aiLimiter, ragRoutes); // Using aiLimiter for RAG as well
app.use('/api/profile', profileRoutes);
// Note: /api/webhooks is mounted above (raw body parser) before express.json().

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Unknown routes get a consistent JSON 404 rather than Express's default
// HTML "Cannot POST ..." body.
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err.message || err);
  res.status(500).json({ error: 'An internal server error occurred.' });
});

if (require.main === module) {
  // Start Cron Job only when running directly
  startIngestionCron();
  startSyncCron();
  startMergedPrSyncCron();
  const server = app.listen(PORT, () => {
    console.log(`Backend server running on port ${PORT}`);
  });

  // Stop accepting new connections and drain in-flight requests on a deploy
  // signal so we don't cut off responses mid-flight.
  const shutdown = (signal) => {
    console.log(`${signal} received, shutting down gracefully...`);
    server.close(() => {
      console.log('HTTP server closed.');
      process.exit(0);
    });
    // Force-exit if connections don't drain in time.
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

module.exports = app;
