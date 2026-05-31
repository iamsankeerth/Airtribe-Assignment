const db = require('../database/db');
const { google } = require('googleapis');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Rich pre-populated mock sent emails for sandbox training
const MOCK_SENT_EMAILS = [
  "Hi Marcus, thanks for the ping. Let me know what works best for a call. Cheers, Demo User",
  "Dear Dr. Watson, I have reviewed the speaker agreements. Everything looks fine. I will send over the slides by next Wednesday. Best regards, Demo User",
  "Hey David, super down for coffee! Wednesday at 1 PM works great. Let me know if that spot on 4th street is cool. Cheers, Demo User",
  "Hello Team, quick update: I have deployed the fix for the database connection pool. Let's monitor response times. Cheers, Demo User",
  "Hi Sarah, thanks for reaching out. Yes, I'm available this Thursday at 3 PM. Let me know what link you want to use. Best, Demo User"
];

class StyleLearnerService {
  
  // Simulate analyzing sent emails in Sandbox Mode
  async learnFromMockSentEmails() {
    await db.log('System', 'Info', 'Initiating sent email analysis in Sandbox Mode...');
    
    // Simulate training cycles / AI analysis steps
    await new Promise(resolve => setTimeout(resolve, 800));
    await db.log('System', 'Info', 'Scanning local outbox (found 5 historical replies)...');
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    await db.log('System', 'Info', 'Extracting stylistic markers: Tone mapping, salutations, structures...');
    
    const profile = {
      toneDistribution: { formal: 20, friendly: 60, concise: 20 },
      sentenceLength: 'short to moderate (avg. 10 words)',
      signatureStyle: "Friendly and brief, prepended with 'Cheers' or 'Best'",
      commonPhrases: ['thanks for the ping', 'Let me know what works', 'Cheers', 'super down'],
      analysisTimestamp: new Date().toISOString(),
      summary: 'Learned profile from Sandbox: The user prefers warm, friendly, and action-oriented responses. Openings are highly casual ("Hey", "Hi") and endings consistently use "Cheers" or "Best" before the signature. Sentences are generally short, direct, and rarely exceed 15 words.'
    };

    const preferences = db.get('preferences');
    preferences.styleProfile = profile;
    db.set('preferences', preferences);
    
    await db.log('System', 'Info', 'Successfully compiled and updated Sandbox Writing Style Profile.');
    return profile;
  }

  // Live Mode style analyzer using Gemini
  async learnFromLiveSentEmails() {
    const creds = db.get('credentials');
    const preferences = db.get('preferences');

    if (creds.mode === 'Sandbox' || !creds.geminiApiKey) {
      return this.learnFromMockSentEmails();
    }

    await db.log('System', 'Info', 'Starting live Gmail sent outbox analysis...');
    
    try {
      const { google } = require('googleapis');
      const gmailService = require('./gmail');
      const authClient = await gmailService.getAuthenticatedClient();
      const gmail = google.gmail({ version: 'v1', auth: authClient });

      await db.log('Gmail', 'Info', 'Fetching user\'s last 10 sent emails...');
      
      const listRes = await gmail.users.messages.list({
        userId: 'me',
        q: 'from:me',
        maxResults: 10
      });

      const messages = listRes.data.messages || [];
      if (messages.length === 0) {
        await db.log('System', 'Warning', 'No sent emails found in Gmail outbox to analyze. Falling back to sandbox corpus.');
        return this.learnFromMockSentEmails();
      }

      const bodies = [];
      for (const msg of messages) {
        try {
          const detail = await gmail.users.messages.get({
            userId: 'me',
            id: msg.id,
            format: 'full'
          });
          const body = gmailService.parseBody(detail.data.payload);
          if (body && body.trim().length > 10) {
            // Strip out long previous quotes if any, just keep the user's raw message
            const rawBody = body.split('\nOn ')[0].split('-----Original Message-----')[0].trim();
            bodies.push(rawBody);
          }
        } catch (err) {
          // Ignore individual fetch errors
        }
      }

      const corpus = bodies.join('\n\n--- NEXT SENT EMAIL ---\n\n');
      if (!corpus.trim()) {
        await db.log('System', 'Warning', 'Could not extract valid text bodies from sent emails. Using sandbox profile fallback.');
        return this.learnFromMockSentEmails();
      }

      await db.log('AI', 'Info', `Sending sent email corpus (${bodies.length} messages) to Gemini for writing style extraction...`);
      
      const genAI = new GoogleGenerativeAI(creds.geminiApiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

      const prompt = `
You are a stylistic linguistic expert. Analyze the following collection of sent emails written by a single user.
Identify their writing style, tone, common phrases, signature patterns, and sentence length preferences.

CORPUS OF SENT EMAILS:
"""
${corpus}
"""

Provide your analysis in STRICT JSON format matching the schema below. Do not include markdown code fence blocks or comments in your response outside the JSON.
Schema:
{
  "toneDistribution": { "formal": number, "friendly": number, "concise": number },
  "sentenceLength": "string (e.g. short, moderate, long)",
  "signatureStyle": "string description",
  "commonPhrases": ["array of 3 to 5 common greeting, closing, or filler phrases used by the user"],
  "summary": "a brief 2-3 sentence overview describing their unique voice, greeting patterns, and structural tendencies"
}
`;

      const result = await model.generateContent(prompt);
      let text = result.response.text().trim();
      
      // Clean up potential markdown JSON block formatting if outputted by LLM
      if (text.startsWith('```')) {
        text = text.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
      }

      let profile;
      try {
        profile = JSON.parse(text);
        profile.analysisTimestamp = new Date().toISOString();
      } catch (jsonErr) {
        await db.log('AI', 'Warning', 'Failed to parse Gemini style profile JSON. Re-formatting to fallback.');
        // If parsing fails, fall back to safe parsing or sandbox profile
        throw new Error('Invalid JSON returned by LLM');
      }

      preferences.styleProfile = profile;
      db.set('preferences', preferences);

      await db.log('System', 'Info', 'Live Writing Style Profile compiled successfully from actual sent emails.');
      return profile;

    } catch (err) {
      await db.log('System', 'Error', `Failed to construct Live Style Profile: ${err.message}. Using Sandbox simulation.`);
      return this.learnFromMockSentEmails();
    }
  }
}

module.exports = new StyleLearnerService();
