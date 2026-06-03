const { GoogleGenerativeAI } = require('@google/generative-ai');
const { normalizeStyleProfile } = require('../styleProfile');

async function generateReplyDraft(prompt, creds) {
  const genAI = new GoogleGenerativeAI(creds.geminiApiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const result = await model.generateContent(prompt);
  return result.response.text().trim();
}

async function learnStyleProfile(prompt, creds) {
  const genAI = new GoogleGenerativeAI(creds.geminiApiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  const result = await model.generateContent(prompt);
  let text = result.response.text().trim();

  if (text.startsWith('```')) {
    text = text.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
  }

  return normalizeStyleProfile(JSON.parse(text));
}

module.exports = {
  generateReplyDraft,
  learnStyleProfile
};
