const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabaseAdmin');
const requireAuth = require('../middleware/requireAuth');

// Link (or update) the caller's GitHub account so PR-merge webhooks can award XP.
router.put('/github', requireAuth, async (req, res) => {
  /** Only GitHub-issued identity data is trusted; user_metadata is editable by the user. */
  const username = req.user.identities?.find((i) => i.provider === 'github')?.identity_data?.user_name;
  if (!username) {
    return res.status(403).json({ error: 'Sign in with GitHub to link your account' });
  }
  const requested = req.body?.github_username;
  if (requested && String(requested).trim().toLowerCase() !== username.toLowerCase()) {
    return res.status(403).json({ error: 'You can only link the GitHub account you signed in with' });
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

// Pull the caller's merged PRs from GitHub and credit any that are new.
// Lets a just-merged PR show up on the dashboard without waiting for the cron.
router.post('/sync-github', requireAuth, async (req, res) => {
  const { syncMergedPrsForProfile } = require('../services/githubSync');

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('id, github_username')
    .eq('id', req.user.id)
    .single();

  if (profileErr || !profile) {
    return res.status(500).json({ error: 'Could not load profile' });
  }
  if (!profile.github_username) {
    return res.status(400).json({ error: 'Link a GitHub username first' });
  }

  try {
    const { newlyCredited } = await syncMergedPrsForProfile(profile);

    const [{ data: updated }, { count }] = await Promise.all([
      supabase
        .from('profiles')
        .select('xp, level, daily_streak, last_contribution_date')
        .eq('id', req.user.id)
        .single(),
      supabase
        .from('contributions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', req.user.id),
    ]);

    res.json({ newly_credited: newlyCredited, merged_pr_count: count ?? 0, profile: updated });
  } catch (err) {
    if (err.response && [403, 429].includes(err.response.status)) {
      return res.status(429).json({ error: 'GitHub rate limit hit, try again shortly' });
    }
    console.error('GitHub sync failed:', err.message || err);
    res.status(502).json({ error: 'Could not reach GitHub' });
  }
});

module.exports = router;
module.exports.requireAuth = requireAuth;
