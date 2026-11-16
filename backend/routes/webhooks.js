const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const supabase = require('../lib/supabaseAdmin');
const { creditMergedPr } = require('../services/githubSync');

/**
 * Verifies the GitHub HMAC signature against the RAW request body.
 *
 * This MUST run on the raw bytes GitHub signed. The route is mounted with
 * express.raw() in server.js, so req.body is a Buffer here. Re-serializing a
 * parsed object (JSON.stringify) would NOT reproduce those bytes and the
 * digest would never match.
 *
 * Fails closed: if no secret is configured, every request is rejected.
 */
const verifyGitHubSignature = (req, res, next) => {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    console.error('GITHUB_WEBHOOK_SECRET is not set — rejecting webhook request.');
    return res.status(500).send('Webhook secret not configured');
  }

  const signature = req.headers['x-hub-signature-256'];
  if (!signature) {
    return res.status(401).send('No signature found');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
  const digest = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;

  const sigBuf = Buffer.from(signature);
  const digBuf = Buffer.from(digest);
  if (sigBuf.length !== digBuf.length || !crypto.timingSafeEqual(sigBuf, digBuf)) {
    return res.status(401).send('Signature mismatch');
  }

  next();
};

/**
 * Records the delivery id so redeliveries are processed at most once.
 * Returns true if this is a fresh delivery, false if it's a duplicate.
 */
const isFreshDelivery = async (deliveryId, event) => {
  if (!deliveryId) return true; // nothing to dedupe on; let it through

  const { error } = await supabase
    .from('webhook_deliveries')
    .insert({ delivery_id: deliveryId, event });

  // 23505 = unique_violation → we've already seen this delivery.
  if (error && (error.code === '23505' || /duplicate key/i.test(error.message || ''))) {
    return false;
  }
  if (error) {
    // Don't block on a logging-table failure; just note it and continue.
    console.error('Failed to record webhook delivery:', error.message);
  }
  return true;
};

const awardXpForMergedPr = async (payload) => {
  const pr = payload.pull_request;
  const githubUsername = pr.user.login;

  // Find the internal profile linked to this GitHub account (case-insensitive).
  const { data: profiles, error: profileErr } = await supabase
    .from('profiles')
    .select('id, github_username')
    .ilike('github_username', githubUsername);

  if (profileErr) {
    throw new Error(`Profile lookup failed: ${profileErr.message}`);
  }
  if (!profiles || profiles.length === 0) {
    console.log(`No linked profile for GitHub user "${githubUsername}"; nothing to award.`);
    return;
  }
  const profile = profiles[0];

  // Shape the webhook payload like a search-API item so the shared crediting
  // path (contributions dedupe + XP + streak) is identical to the polling sync.
  const wasCredited = await creditMergedPr(profile, {
    number: pr.number,
    title: pr.title,
    body: pr.body,
    html_url: pr.html_url,
    closed_at: pr.closed_at,
    pull_request: { merged_at: pr.merged_at },
    repository_url: `https://api.github.com/repos/${payload.repository.full_name}`,
  });

  if (!wasCredited) {
    console.log(`PR #${pr.number} already credited to ${githubUsername}; skipping.`);
  }
};

router.post('/github', verifyGitHubSignature, async (req, res) => {
  const event = req.headers['x-github-event'];
  const deliveryId = req.headers['x-github-delivery'];

  let payload;
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : req.body;
    payload = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (err) {
    return res.status(400).send('Invalid JSON payload');
  }

  // GitHub sends a `ping` when a webhook is first configured; reply so the
  // dashboard shows a green check.
  if (event === 'ping') {
    return res.status(200).json({ message: 'pong' });
  }

  // Ack fast for anything we don't act on.
  const isMergedPr =
    event === 'pull_request' && payload.action === 'closed' && payload.pull_request?.merged;
  if (!isMergedPr) {
    return res.status(200).send('Webhook received');
  }

  try {
    if (!(await isFreshDelivery(deliveryId, event))) {
      return res.status(200).send('Duplicate delivery ignored');
    }
    await awardXpForMergedPr(payload);
  } catch (err) {
    // Never 500 to GitHub for our own processing errors — that just triggers
    // retries. Log it; dedup + atomic award keep a manual retry safe.
    console.error('Error processing merged PR webhook:', err.message || err);
  }

  res.status(200).send('Webhook received');
});

module.exports = router;
module.exports.verifyGitHubSignature = verifyGitHubSignature;
