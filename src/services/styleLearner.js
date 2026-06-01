const db = require('../database/db');
const { google } = require('googleapis');
const { GoogleGenerativeAI } = require('@google/generative-ai');

class StyleLearnerService {
  buildHeuristicProfile(samples) {
    const joined = samples.join('\n');
    const words = joined
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .filter(Boolean);
    const sentenceCount = Math.max(
      1,
      samples.reduce((count, sample) => count + (sample.match(/[.!?]+/g) || []).length, 0)
    );
    const avgWords = Math.max(1, Math.round(words.length / sentenceCount));

    const knownPhrases = [
      'Thanks',
      'Thank you',
      'Best',
      'Regards',
      'Cheers',
      'Let me know',
      'Happy to',
      'Appreciate'
    ];
    const commonPhrases = knownPhrases.filter(phrase =>
      new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(joined)
    );

    const greetings = samples.filter(sample => /^(hi|hello|hey|dear)\b/i.test(sample.trim())).length;
    const exclamations = samples.filter(sample => sample.includes('!')).length;
    const friendly = Math.max(10, Math.min(80, Math.round(((greetings + exclamations) / (samples.length * 2)) * 100)));
    const formal = Math.max(
      10,
      Math.min(70, Math.round((samples.filter(sample => /^dear\b/i.test(sample.trim())).length / samples.length) * 100 + 20))
    );
    const concise = Math.max(10, Math.min(70, 100 - Math.round(avgWords * 2)));
    const signoff = commonPhrases.find(phrase => /best|regards|cheers/i.test(phrase));

    return {
      toneDistribution: {
        formal,
        friendly,
        concise
      },
      sentenceLength: avgWords <= 10 ? 'short' : avgWords <= 18 ? 'moderate' : 'long',
      signatureStyle: signoff
        ? `Usually signs off with "${signoff}".`
        : 'Varies by recipient; no strong repeated sign-off detected.',
      commonPhrases: commonPhrases.slice(0, 5),
      summary: `Derived from ${samples.length} sent emails. The user tends to write ${avgWords <= 10 ? 'brief' : avgWords <= 18 ? 'balanced' : 'detailed'} replies with ${greetings > 0 ? 'clear greetings' : 'minimal greeting ritual'} and ${commonPhrases.length ? 'repeatable phrasing patterns' : 'light variation across replies'}.`,
      analysisTimestamp: new Date().toISOString()
    };
  }

  async fetchSentEmailBodies() {
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
      throw new Error('No sent emails found in Gmail outbox to analyze.');
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
          const rawBody = body.split('\nOn ')[0].split('-----Original Message-----')[0].trim();
          bodies.push(rawBody);
        }
      } catch (err) {
        await db.log('Gmail', 'Warning', `Skipping sent message ${msg.id}: ${err.message}`);
      }
    }

    if (!bodies.length) {
      throw new Error('Could not extract valid text bodies from sent emails.');
    }

    return bodies;
  }

  async learnFromSentEmails() {
    const creds = db.get('credentials');
    const preferences = db.get('preferences');

    await db.log('System', 'Info', 'Starting Gmail sent-mail analysis...');

    try {
      const bodies = await this.fetchSentEmailBodies();
      const corpus = bodies.join('\n\n--- NEXT SENT EMAIL ---\n\n');

      if (!creds.geminiApiKey) {
        await db.log('AI', 'Warning', 'Gemini API key is missing. Building style profile with local heuristics.');
        const profile = this.buildHeuristicProfile(bodies);
        preferences.styleProfile = profile;
        db.set('preferences', preferences);
        return profile;
      }

      await db.log('AI', 'Info', `Sending sent email corpus (${bodies.length} messages) to Gemini for writing style extraction...`);

      const genAI = new GoogleGenerativeAI(creds.geminiApiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

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

      if (text.startsWith('```')) {
        text = text.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
      }

      let profile;
      try {
        profile = JSON.parse(text);
        profile.analysisTimestamp = new Date().toISOString();
      } catch (jsonErr) {
        await db.log('AI', 'Warning', 'Failed to parse Gemini style profile JSON.');
        throw new Error('Invalid JSON returned by LLM');
      }

      preferences.styleProfile = profile;
      db.set('preferences', preferences);

      await db.log('System', 'Info', 'Writing style profile compiled successfully from sent emails.');
      return profile;
    } catch (err) {
      await db.log('System', 'Error', `Failed to construct writing style profile: ${err.message}`);
      throw err;
    }
  }
}

module.exports = new StyleLearnerService();
