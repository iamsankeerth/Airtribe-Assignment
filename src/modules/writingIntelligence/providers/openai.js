const { OpenAI } = require('openai');

async function generateReplyDraft(prompt, creds) {
  const openai = new OpenAI({ apiKey: creds.openaiApiKey });
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }]
  });

  return completion.choices[0].message.content.trim();
}

module.exports = {
  generateReplyDraft
};
