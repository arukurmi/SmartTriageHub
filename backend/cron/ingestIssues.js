const cron = require('node-cron');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenAI } = require('@google/genai');

global.WebSocket = require('ws');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const LANGUAGES = ['JavaScript', 'Python', 'Go', 'TypeScript', 'Rust'];
const ISSUES_PER_LANGUAGE = 1; // Reduced for testing to avoid rate limits
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
        timeout: 10000, // 10 seconds timeout
        headers: process.env.GITHUB_TOKEN ? {
          Authorization: `token ${process.env.GITHUB_TOKEN}`
        } : {}
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
            
            const aiResponse = await ai.models.generateContent({
               model: 'gemini-2.5-flash',
               contents: `Issue Title: ${issue.title}\n\nIssue Body: ${issue.body?.substring(0, 5000) || 'No body provided.'}`,
               config: { systemInstruction: systemPrompt }
            });
            
            let aiText = aiResponse.text;
            if (aiText.startsWith('```json')) aiText = aiText.replace(/```json/g, '').replace(/```/g, '').trim();
            
            const result = JSON.parse(aiText);
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
