const { preferencesRepo, credentialsRepo, auditLogRepo } = require('../../database/repositories');
const gmailService = require('../../services/gmail');
const { buildHeuristicProfile } = require('./styleProfile');
const geminiProvider = require('./providers/gemini');

async function learnStyleProfile() {
  const creds = credentialsRepo.get();
  const preferences = preferencesRepo.get();

  await auditLogRepo.log('System', 'Info', 'Starting Gmail sent-mail analysis...');

  try {
    const bodies = await gmailService.fetchSentBodies(10);
    const corpus = bodies.join('\n\n--- NEXT SENT EMAIL ---\n\n');

    if (!creds.geminiApiKey) {
      await auditLogRepo.log('AI', 'Warning', 'Gemini API key is missing. Building style profile with local heuristics.');
      const profile = buildHeuristicProfile(bodies);
      preferences.styleProfile = profile;
      await preferencesRepo.save(preferences);
      return profile;
    }

    await auditLogRepo.log('AI', 'Info', `Sending sent email corpus (${bodies.length} messages) to Gemini for writing style extraction...`);

    const prompt = `You are analyzing a user's sent emails to build a lightweight writing style profile for an email reply assistant.

Your job:
- Infer broad, repeated writing patterns from the samples.
- Focus on useful reply-style signals, not personality speculation.
- Return only valid JSON matching the required schema.

What to analyze:
- overall tone tendency
- sentence length tendency
- common greeting or closing phrases
- signature style
- whether the user tends to sound formal, friendly, or concise

Rules:
- Base conclusions only on repeated patterns across multiple messages.
- Do not overfit to one unusual email.
- Do not guess facts not supported by the samples.
- Ignore quoted thread history where possible.
- Ignore one-off proper nouns unless they are part of a repeated phrase pattern.
- Keep the summary conservative and evidence-based.
- Do not output markdown, explanations, or prose outside the JSON.

Sent email corpus:
"""
${corpus}
"""

Return JSON with exactly this schema:
{
  "toneDistribution": { "formal": number, "friendly": number, "concise": number },
  "sentenceLength": "short | moderate | long",
  "signatureStyle": "string description",
  "commonPhrases": ["3 to 5 repeated greeting, closing, or filler phrases if clearly supported"],
  "summary": "2 to 3 sentence evidence-based summary of the user's email voice"
}`;

    const profile = await geminiProvider.learnStyleProfile(prompt, creds);
    preferences.styleProfile = profile;
    await preferencesRepo.save(preferences);

    await auditLogRepo.log('System', 'Info', 'Writing style profile compiled successfully from sent emails.');
    return profile;
  } catch (err) {
    await auditLogRepo.log('System', 'Error', `Failed to construct writing style profile: ${err.message}`);
    throw err;
  }
}

module.exports = {
  learnStyleProfile
};
