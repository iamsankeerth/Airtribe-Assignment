function buildHeuristicProfile(samples) {
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

function normalizeStyleProfile(profile) {
  return {
    toneDistribution: {
      formal: Number(profile?.toneDistribution?.formal || 0),
      friendly: Number(profile?.toneDistribution?.friendly || 0),
      concise: Number(profile?.toneDistribution?.concise || 0)
    },
    sentenceLength: profile?.sentenceLength || 'moderate',
    signatureStyle: profile?.signatureStyle || 'Varies by recipient; no strong repeated sign-off detected.',
    commonPhrases: Array.isArray(profile?.commonPhrases) ? profile.commonPhrases.slice(0, 5) : [],
    summary: profile?.summary || 'Write standard professional replies.',
    analysisTimestamp: new Date().toISOString()
  };
}

module.exports = {
  buildHeuristicProfile,
  normalizeStyleProfile
};
