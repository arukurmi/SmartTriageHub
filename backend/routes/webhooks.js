const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Middleware to verify GitHub webhook signature
const verifyGitHubSignature = (req, res, next) => {
  const signature = req.headers['x-hub-signature-256'];
  if (!signature && process.env.GITHUB_WEBHOOK_SECRET) {
    return res.status(401).send('No signature found');
  }

  if (process.env.GITHUB_WEBHOOK_SECRET) {
    const payload = JSON.stringify(req.body);
    const hmac = crypto.createHmac('sha256', process.env.GITHUB_WEBHOOK_SECRET);
    const digest = `sha256=${hmac.update(payload).digest('hex')}`;
    
    if (signature !== digest) {
      return res.status(401).send('Signature mismatch');
    }
  }

  next();
};

router.post('/github', verifyGitHubSignature, async (req, res) => {
  const event = req.headers['x-github-event'];
  const payload = req.body;

  // We are specifically listening for Pull Requests being closed
  if (event === 'pull_request' && payload.action === 'closed') {
    const pr = payload.pull_request;
    
    // Only care if the PR was actually merged, not just closed
    if (pr.merged) {
      const githubUsername = pr.user.login;
      
      // Look for the "Closes #123" pattern in the PR body to find linked issues
      const issueMatch = pr.body?.match(/(?:close|closes|closed|fix|fixes|fixed|resolve|resolves|resolved)\s+#(\d+)/i);
      
      if (issueMatch) {
        const issueNumber = issueMatch[1];
        
        // Find our internal user linked to this GitHub username
        // (Assuming we have a 'github_username' column in profiles, if not this is a mock implementation for XP)
        const { data: profiles, error: profileErr } = await supabase
          .from('profiles')
          .select('id, xp, level')
          .eq('github_username', githubUsername);
          
        if (!profileErr && profiles && profiles.length > 0) {
          const profile = profiles[0];
          
          // Fetch the issue score to award proper XP
          // Repo format expected: 'owner/repo'
          const repoName = payload.repository.full_name;
          const { data: issues } = await supabase
            .from('issues')
            .select('id, score')
            .eq('repo_name', repoName)
            .ilike('url', `%/${issueNumber}`); // Simple match for the issue ID in the URL
            
          let xpAward = 50; // default
          if (issues && issues.length > 0) {
            xpAward = issues[0].score * 10; // e.g. score 5 = 50 XP
            
            // Delete the issue from our board since it's merged!
            await supabase.from('issues').delete().eq('id', issues[0].id);
          }
          
          // Award XP and calculate new level
          const newXp = profile.xp + xpAward;
          const newLevel = Math.floor(newXp / 100) + 1; // 100 XP per level
          
          await supabase
            .from('profiles')
            .update({ xp: newXp, level: newLevel })
            .eq('id', profile.id);
            
          console.log(`Awarded ${xpAward} XP to ${githubUsername} for merging PR #${pr.number}`);
        }
      }
    }
  }

  res.status(200).send('Webhook received');
});

module.exports = router;
