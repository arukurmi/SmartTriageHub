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
        
        try {
          await sleep(4000); // Prevent Gemini API Free Tier 429 Error
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
        } catch (aiErr) {
          console.error(`AI Analysis failed for issue ${issue.id}:`, aiErr.message);
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
