const cron = require('node-cron');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const syncClosedIssues = async () => {
  console.log('Starting synchronization of closed issues...');
  
  try {
    // 1. Fetch all currently open issues from our database
    const { data: issues, error } = await supabase
      .from('issues')
      .select('id, github_issue_id, url');
      
    if (error) throw error;
    if (!issues || issues.length === 0) {
      console.log('No issues in database to sync.');
      return;
    }

    console.log(`Checking status for ${issues.length} issues against GitHub API...`);

    let closedCount = 0;

    // 2. Iterate through and check GitHub status
    for (const issue of issues) {
      try {
        // Extract owner, repo, and issue number from URL: https://github.com/owner/repo/issues/123
        const urlParts = issue.url.split('/');
        const issueNumber = urlParts.pop();
        urlParts.pop(); // remove 'issues'
        const repo = urlParts.pop();
        const owner = urlParts.pop();

        const response = await axios.get(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`, {
          timeout: 10000,
          headers: process.env.GITHUB_TOKEN ? {
            Authorization: `token ${process.env.GITHUB_TOKEN}`
          } : {}
        });

        // 3. If the issue state is closed, delete it from our DB to keep pagination clean
        if (response.data.state === 'closed') {
          await supabase.from('issues').delete().eq('id', issue.id);
          closedCount++;
          console.log(`Issue ${issueNumber} is closed on GitHub. Removed from local DB.`);
        }
      } catch (err) {
        // Handle 404 (deleted on GitHub) or rate limits
        if (err.response && err.response.status === 404) {
          await supabase.from('issues').delete().eq('id', issue.id);
          closedCount++;
          console.log(`Issue deleted on GitHub. Removed from local DB.`);
        } else {
          console.error(`Failed to check issue ${issue.id}:`, err.message);
        }
      }
      
      // Delay to respect GitHub API rate limits
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`Sync complete. Removed ${closedCount} stale/closed issues.`);
  } catch (globalErr) {
    console.error('Fatal error during syncClosedIssues:', globalErr.message);
  }
};

const startSyncCron = () => {
  // Run every 12 hours
  cron.schedule('0 */12 * * *', () => {
    syncClosedIssues();
  });
};

module.exports = { startSyncCron, syncClosedIssues };
