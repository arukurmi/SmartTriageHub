const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const { githubHeaders, GITHUB_TIMEOUT_MS } = require('../lib/github');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Same crediting rules as the webhook path (routes/webhooks.js).
const CLOSING_KEYWORD = /(?:close|closes|closed|fix|fixes|fixed|resolve|resolves|resolved)\s+#(\d+)/i;
const DEFAULT_XP = 50;
const XP_PER_SCORE_POINT = 10;

/**
 * Fetches the user's most recently updated merged PRs from GitHub's public
 * search API. Works for any public repo — no webhook installation needed.
 */
const fetchMergedPrs = async (githubUsername) => {
  const response = await axios.get('https://api.github.com/search/issues', {
    params: {
      q: `is:pr is:merged author:${githubUsername}`,
      sort: 'updated',
      order: 'desc',
      per_page: 50,
    },
    headers: githubHeaders(),
    timeout: GITHUB_TIMEOUT_MS, // don't let a hung GitHub request stall the sync loop
  });
  return response.data.items || [];
};

/**
 * Credits one merged PR to a profile: inserts the contribution row (the
 * unique (user_id, repo_name, pr_number) key dedupes against both prior sync
 * runs and the webhook path), then awards XP + streak atomically.
 * Returns true if this PR was newly credited.
 */
const creditMergedPr = async (profile, pr) => {
  // search results carry repository_url like .../repos/{owner}/{repo}
  if (!pr?.repository_url || typeof pr.number !== 'number') {
    throw new Error('Cannot credit PR: missing repository_url or number');
  }
  const repoName = pr.repository_url.split('/').slice(-2).join('/');
  const mergedAt = pr.pull_request?.merged_at || pr.closed_at;

  const { error: insertErr } = await supabase.from('contributions').insert({
    user_id: profile.id,
    repo_name: repoName,
    pr_number: pr.number,
    pr_title: pr.title,
    pr_url: pr.html_url,
    merged_at: mergedAt,
    xp_awarded: 0, // updated below once the award size is known
  });

  if (insertErr) {
    // 23505 = unique_violation → already credited (by an earlier run or the webhook).
    if (insertErr.code === '23505' || /duplicate key/i.test(insertErr.message || '')) {
      return false;
    }
    throw new Error(`Failed to record contribution for PR ${repoName}#${pr.number}: ${insertErr.message}`);
  }

  // Size the reward from the referenced internal issue, if any.
  let xpAward = DEFAULT_XP;
  let matchedIssue = null;
  const issueMatch = pr.body?.match(CLOSING_KEYWORD);
  if (issueMatch) {
    const { data: issues } = await supabase
      .from('issues')
      .select('id, score')
      .eq('repo_name', repoName)
      .eq('github_issue_number', Number(issueMatch[1]));
    if (issues && issues.length > 0) {
      matchedIssue = issues[0];
      xpAward = matchedIssue.score * XP_PER_SCORE_POINT;
    }
  }

  const mergedDate = (mergedAt || new Date().toISOString()).slice(0, 10);
  const { error: rpcErr } = await supabase.rpc('record_contribution', {
    p_user_id: profile.id,
    p_xp_delta: xpAward,
    p_merged_date: mergedDate,
  });
  if (rpcErr) {
    // Roll back the marker so a later run can retry the award.
    await supabase
      .from('contributions')
      .delete()
      .eq('user_id', profile.id)
      .eq('repo_name', repoName)
      .eq('pr_number', pr.number);
    throw new Error(`Failed to award XP for PR ${repoName}#${pr.number}: ${rpcErr.message}`);
  }

  await supabase
    .from('contributions')
    .update({ xp_awarded: xpAward })
    .eq('user_id', profile.id)
    .eq('repo_name', repoName)
    .eq('pr_number', pr.number);

  // Once solved, the issue leaves the board (same behavior as the webhook).
  if (matchedIssue) {
    const { error: delErr } = await supabase.from('issues').delete().eq('id', matchedIssue.id);
    if (delErr) console.error(`Failed to remove merged issue ${matchedIssue.id}:`, delErr.message);
  }

  console.log(`Awarded ${xpAward} XP to ${profile.github_username} for merged PR ${repoName}#${pr.number}.`);
  return true;
};

/**
 * Syncs all merged PRs for one profile. Returns { synced, newlyCredited }.
 * profile must include { id, github_username }.
 */
const syncMergedPrsForProfile = async (profile) => {
  if (!profile?.github_username) return { synced: 0, newlyCredited: 0 };

  const prs = await fetchMergedPrs(profile.github_username);
  let newlyCredited = 0;
  for (const pr of prs) {
    try {
      if (await creditMergedPr(profile, pr)) newlyCredited += 1;
    } catch (err) {
      console.error(err.message || err);
    }
  }
  return { synced: prs.length, newlyCredited };
};

module.exports = { syncMergedPrsForProfile, fetchMergedPrs, creditMergedPr };
