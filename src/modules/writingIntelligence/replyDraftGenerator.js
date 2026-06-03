const {
  inboxRepo,
  preferencesRepo,
  credentialsRepo,
  auditLogRepo
} = require('../../database/repositories');
const { buildThreadHistoryPrompt } = require('./threadContext');
const heuristicProvider = require('./providers/heuristic');
const openaiProvider = require('./providers/openai');
const anthropicProvider = require('./providers/anthropic');
const geminiProvider = require('./providers/gemini');

function buildDraftPrompt(email, tone, preferences, styleProfile, threadHistoryPrompt) {
  return `You are Draftly, an AI assistant that drafts email replies for a Gmail user.

Your job:
- Draft a reply to the latest RECEIVED email in the thread.
- Use only the thread history and the user's saved preferences.
- Help with routine professional email replies such as confirmations, follow-ups, meeting responses, acknowledgements, and clarifications.

Hard rules:
- Use only facts explicitly present in the thread history or user preferences.
- Do not invent actions, reviews, approvals, attachments, timelines, offers, meeting slots, or business decisions.
- Do not pretend to be the other side of the conversation.
- Do not assume the sender's intent beyond what the latest message clearly asks.
- If the latest message is vague, write a short acknowledgement or a clarification request instead of guessing.
- Preserve unanswered questions from the sender. Do not silently answer with made-up details.
- Do not repeat the email subject.
- Output only the reply body. No markdown. No commentary. No labels.

User preferences:
- Custom instructions: "${preferences.customInstructions || 'None'}"
- Signature: "${preferences.signature || ''}"

Learned writing style:
- Summary: ${styleProfile.summary || 'Write standard professional replies.'}
- Common phrases to mimic when appropriate: ${JSON.stringify(styleProfile.commonPhrases || [])}
- Preferred sentence length: ${styleProfile.sentenceLength || 'moderate'}

Requested tone:
- ${tone}
Interpret tone like this:
- Concise: short, direct, professional
- Friendly: warm, natural, human
- Formal: respectful, polished, businesslike
- Custom: follow the user's custom instructions while staying grounded in the thread

Thread history (oldest first):
${threadHistoryPrompt}

Before writing, internally determine:
1. What is the latest sender asking for?
2. Which facts are explicitly available?
3. What information is missing?
Then write the safest helpful reply using only supported facts.

Additional guidance:
- If the thread is an application, outreach, or introduction email, do not fabricate recruiter-side or company-side process updates.
- If the thread is a confirmation or scheduling email, confirm only details explicitly stated in the thread.
- If the thread does not justify a long answer, keep the reply short.
- Use the user's signature at the end if provided.

Write the final reply now.`;
}

async function generateReplyDraft({ email, tone = 'Concise' }) {
  const preferences = preferencesRepo.get();
  const styleProfile = preferences.styleProfile || {};
  const creds = credentialsRepo.get() || {};
  const provider = (creds.aiProvider || 'gemini').toLowerCase().trim();

  await auditLogRepo.log('AI', 'Info', `Requesting AI draft generation for Subject: "${email.subject}" using Provider: "${provider}" with Tone: ${tone}`);

  const threadEmails = inboxRepo
    .findByThreadId(email.threadId)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const userEmail = (creds.userEmail || '').toLowerCase().trim();
  const threadHistoryPrompt = buildThreadHistoryPrompt(email, threadEmails, userEmail);
  const prompt = buildDraftPrompt(email, tone, preferences, styleProfile, threadHistoryPrompt);

  if (provider === 'openai') {
    if (!creds.openaiApiKey) {
      await auditLogRepo.log('AI', 'Warning', 'OpenAI API key is missing. Using local fallback draft generation.');
      return heuristicProvider.generateReplyDraft(email, tone, preferences, styleProfile);
    }

    try {
      await auditLogRepo.log('AI', 'Info', 'Initializing OpenAI engine...');
      const text = await openaiProvider.generateReplyDraft(prompt, creds);
      await auditLogRepo.log('AI', 'Info', `OpenAI response received successfully (length: ${text.length} chars).`);
      return text;
    } catch (err) {
      await auditLogRepo.log('AI', 'Error', `OpenAI AI Generation failed: ${err.message}. Falling back to local heuristic model...`);
      return heuristicProvider.generateReplyDraft(email, tone, preferences, styleProfile);
    }
  }

  if (provider === 'anthropic') {
    if (!creds.anthropicApiKey) {
      await auditLogRepo.log('AI', 'Warning', 'Anthropic API key is missing. Using local fallback draft generation.');
      return heuristicProvider.generateReplyDraft(email, tone, preferences, styleProfile);
    }

    try {
      await auditLogRepo.log('AI', 'Info', 'Initializing Anthropic Claude engine...');
      const text = await anthropicProvider.generateReplyDraft(prompt, creds);
      await auditLogRepo.log('AI', 'Info', `Anthropic response received successfully (length: ${text.length} chars).`);
      return text;
    } catch (err) {
      await auditLogRepo.log('AI', 'Error', `Anthropic AI Generation failed: ${err.message}. Falling back to local heuristic model...`);
      return heuristicProvider.generateReplyDraft(email, tone, preferences, styleProfile);
    }
  }

  if (!creds.geminiApiKey) {
    await auditLogRepo.log('AI', 'Warning', 'Gemini API key is missing. Using local fallback draft generation.');
    return heuristicProvider.generateReplyDraft(email, tone, preferences, styleProfile);
  }

  try {
    await auditLogRepo.log('AI', 'Info', 'Initializing Gemini Generative AI engine...');
    const text = await geminiProvider.generateReplyDraft(prompt, creds);
    await auditLogRepo.log('AI', 'Info', `Gemini response received successfully (length: ${text.length} chars).`);
    return text;
  } catch (err) {
    await auditLogRepo.log('AI', 'Error', `Gemini AI Generation failed: ${err.message}. Falling back to local heuristic model...`);
    return heuristicProvider.generateReplyDraft(email, tone, preferences, styleProfile);
  }
}

module.exports = {
  generateReplyDraft
};
