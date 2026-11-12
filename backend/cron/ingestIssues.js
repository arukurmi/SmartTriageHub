const cron = require('node-cron');
const axios = require('axios');
const supabase = require('../lib/supabaseAdmin');
const { githubHeaders, GITHUB_TIMEOUT_MS } = require('../lib/github');
const { generateJson } = require('../lib/gemini');

global.WebSocket = require('ws');

// Languages to ingest and how many issues per language. Both are configurable
// via env so we can keep volume low in dev/CI (avoiding GitHub + Gemini rate
// limits) and turn it up in production without a code change.
const LANGUAGES = (process.env.INGEST_LANGUAGES || 'JavaScript,Python,Go,TypeScript,Rust')
  .split(',')
  .map((l) => l.trim())
  .filter(Boolean);
const ISSUES_PER_LANGUAGE = Number(process.env.ISSUES_PER_LANGUAGE) || 1;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const ingestIssues = async () => {
  console.log('Starting daily issue ingestion...');
  
  for (const lang of LANGUAGES) {
    try {
      console.log(`Fetching issues for ${lang}...`);
      const response = await axios.get(`https://api.github.com/search/issues`, {
        params: {
          q: `label:"good first issue" state:open language:${lang}`,
          sort: 'updated',
          order: 'desc',
          per_page: ISSUES_PER_LANGUAGE
        },
        timeout: GITHUB_TIMEOUT_MS,
        headers: githubHeaders()
      });

      const issues = response.data.items;
      
      for (const issue of issues) {
        if (issue.pull_request) continue;
        
        const systemPrompt = `You are a triage AI. Analyze the following GitHub issue body and output a minified JSON object with the following schema: {"score": <number 1-10 indicating difficulty>, "summary": "<Max two sentences summarizing the issue>"}. Do NOT output markdown formatting like \`\`\`json. Only output the raw minified JSON.`;
        
        let score = 5;
        let summary = "Summary unavailable.";
        
        // Exponential backoff retry logic for Gemini API
        let maxRetries = 3;
        let retryCount = 0;
        let success = false;
        
        while (retryCount < maxRetries && !success) {
          try {
            await sleep(4000 + (retryCount * 5000)); // Base 4s delay, increasing with retries
            
            const result = await generateJson(
              systemPrompt,
              `Issue Title: ${issue.title}\n\nIssue Body: ${issue.body?.substring(0, 5000) || 'No body provided.'}`
            );
            score = result.score || 5;
            summary = result.summary || "No summary provided.";
            success = true; // Break the loop on success
          } catch (aiErr) {
            console.error(`AI Analysis failed for issue ${issue.id} (Attempt ${retryCount + 1}):`, aiErr.message);
            retryCount++;
            
            // If it's a 429 Quota Exceeded or 503 Unavailable, we should wait longer before retrying
            if (aiErr.message.includes('429') || aiErr.message.includes('503') || aiErr.message.includes('quota')) {
              console.log(`Rate limit or unavailability hit. Waiting ${15 * retryCount} seconds before next attempt...`);
              await sleep(15000 * retryCount);
            } else if (retryCount === maxRetries) {
              console.error(`Max retries reached for issue ${issue.id}. Falling back to default score.`);
            }
          }
        }

        const { error } = await supabase.from('issues').upsert({
          github_issue_id: issue.id,
          github_issue_number: issue.number,
          repo_name: issue.repository_url.split('/').slice(-2).join('/'),
          title: issue.title,
          body: issue.body,
          url: issue.html_url,
          language: lang,
          score: score,
          summary: summary
        }, { onConflict: 'github_issue_id' });

        if (error) {
          console.error(`Error inserting issue ${issue.id}:`, error);
        } else {
          console.log(`Upserted issue ${issue.id} with score ${score}`);
        }
      }
    } catch (err) {
      console.error(`Error fetching issues for ${lang}:`, err.message);
    }
  }
  
  console.log('Ingestion complete.');
};

const startIngestionCron = () => {
  cron.schedule('0 0 * * *', () => {
    ingestIssues();
  });
};

module.exports = { startIngestionCron, ingestIssues };
