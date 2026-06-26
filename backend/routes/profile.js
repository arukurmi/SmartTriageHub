const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// GitHub username rules: 1–39 chars, alphanumeric or single hyphens (not
// leading/trailing/consecutive). Validated so we never store junk that the
// webhook would fail to match.
const GITHUB_USERNAME = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;

// Resolve the authenticated user from the Supabase JWT in the Authorization
// header. Identity comes from the verified token, never from the request body.
const requireAuth = async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  req.user = data.user;
  next();
};

// Link (or update) the caller's GitHub account so PR-merge webhooks can award XP.
router.put('/github', requireAuth, async (req, res) => {
  const username = (req.body?.github_username || '').trim();
  if (!GITHUB_USERNAME.test(username)) {
    return res.status(400).json({ error: 'A valid GitHub username is required' });
  }

  const { data, error } = await supabase
    .from('profiles')
    .update({ github_username: username })
    .eq('id', req.user.id)
    .select('id, github_username')
    .single();

  if (error) {
    // 23505 = the case-insensitive unique index rejected a username already
    // claimed by another profile.
    if (error.code === '23505') {
      return res
        .status(409)
        .json({ error: 'That GitHub account is already linked to another user' });
    }
    console.error('Failed to link GitHub username:', error.message);
    return res.status(500).json({ error: 'Could not update profile' });
  }

  res.json({ github_username: data.github_username });
});

module.exports = router;
module.exports.requireAuth = requireAuth;
