const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Matches GitHub issue-closing keywords, e.g. "Fixes #123", "closes #42".
const CLOSING_KEYWORD = /(?:close|closes|closed|fix|fixes|fixed|resolve|resolves|resolved)\s+#(\d+)/i;

const DEFAULT_XP = 50;
const XP_PER_SCORE_POINT = 10;

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

  const issueMatch = pr.body?.match(CLOSING_KEYWORD);
  if (!issueMatch) {
    console.log(`PR #${pr.number} merged but no "Fixes #N" reference found; no XP awarded.`);
    return;
  }
  const issueNumber = Number(issueMatch[1]);

  // Find the internal profile linked to this GitHub account (case-insensitive).
  const { data: profiles, error: profileErr } = await supabase
    .from('profiles')
    .select('id, xp, level')
    .ilike('github_username', githubUsername);

  if (profileErr) {
    console.error('Profile lookup failed:', profileErr.message);
    return;
  }
  if (!profiles || profiles.length === 0) {
    console.log(`No linked profile for GitHub user "${githubUsername}"; nothing to award.`);
    return;
  }
  const profile = profiles[0];

  // Look up the linked issue to size the reward by its difficulty score.
  const repoName = payload.repository.full_name;
  const { data: issues } = await supabase
    .from('issues')
    .select('id, score')
    .eq('repo_name', repoName)
    .eq('github_issue_number', issueNumber);

  const issue = issues && issues.length > 0 ? issues[0] : null;
  const xpAward = issue ? issue.score * XP_PER_SCORE_POINT : DEFAULT_XP;

  // Award XP atomically (concurrent merges can't clobber each other).
  const { error: rpcErr } = await supabase.rpc('increment_xp', {
    p_user_id: profile.id,
    p_xp_delta: xpAward,
  });
  if (rpcErr) {
    console.error(`Failed to award XP to ${githubUsername}:`, rpcErr.message);
    return; // leave the issue in place; redelivery is deduped, manual retry is safe
  }

  // Only remove the issue from the board once XP is safely recorded.
  if (issue) {
    const { error: delErr } = await supabase.from('issues').delete().eq('id', issue.id);
    if (delErr) console.error(`Failed to remove merged issue ${issue.id}:`, delErr.message);
  }

  console.log(`Awarded ${xpAward} XP to ${githubUsername} for merging PR #${pr.number}.`);
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
