const Anthropic = require('@anthropic-ai/sdk');

async function generateReplyDraft(prompt, creds) {
  const anthropic = new Anthropic({ apiKey: creds.anthropicApiKey });
  const response = await anthropic.messages.create({
    model: 'claude-3-5-haiku-20241022',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }]
  });

  return response.content[0].text.trim();
}

module.exports = {
  generateReplyDraft
};
