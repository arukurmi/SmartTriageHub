const cron = require('node-cron');
const supabase = require('../lib/supabaseAdmin');
const { syncMergedPrsForProfile } = require('../services/githubSync');

const syncAllMergedPrs = async () => {
  console.log('Starting merged-PR sync for all linked profiles...');

  try {
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, github_username')
      .not('github_username', 'is', null);

    if (error) throw error;
    if (!profiles || profiles.length === 0) {
      console.log('No profiles with a linked GitHub username to sync.');
      return;
    }

    for (const profile of profiles) {
      try {
        const { newlyCredited } = await syncMergedPrsForProfile(profile);
        if (newlyCredited > 0) {
          console.log(`Credited ${newlyCredited} new merged PR(s) to ${profile.github_username}.`);
        }
      } catch (err) {
        // 403/429 = rate limited; stop this run, the next one catches up.
        if (err.response && [403, 429].includes(err.response.status)) {
          console.error('GitHub search rate limit hit; stopping this sync run.');
          return;
        }
        console.error(`Failed to sync ${profile.github_username}:`, err.message);
      }

      // Search API allows 30 req/min authenticated (10 unauthenticated).
      await new Promise((resolve) => setTimeout(resolve, process.env.GITHUB_TOKEN ? 2500 : 7000));
    }

    console.log('Merged-PR sync complete.');
  } catch (globalErr) {
    console.error('Fatal error during syncAllMergedPrs:', globalErr.message);
  }
};

const startMergedPrSyncCron = () => {
  // Run every 15 minutes
  cron.schedule('*/15 * * * *', () => {
    syncAllMergedPrs();
  });
};

module.exports = { startMergedPrSyncCron, syncAllMergedPrs };
