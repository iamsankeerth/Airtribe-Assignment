function getSenderFirstName(sender = '') {
  const namePart = sender.split('<')[0].trim().replace(/["']/g, '');
  if (!namePart) {
    return 'there';
  }

  return namePart.split(/\s+/)[0] || 'there';
}

function buildGreeting(sender, tone) {
  const firstName = getSenderFirstName(sender);
  if (tone === 'Formal') {
    return `Dear ${firstName},`;
  }

  return `Hi ${firstName},`;
}

function buildBody(tone) {
  if (tone === 'Friendly') {
    return [
      'Thank you for your email.',
      'I have reviewed your message and wanted to follow up without making assumptions beyond what is in the thread.',
      'If there is anything specific you would like me to confirm, please let me know.'
    ];
  }

  if (tone === 'Formal') {
    return [
      'Thank you for your email.',
      'I have reviewed your message and am following up based only on the details provided in the thread.',
      'If you would like me to clarify or confirm anything further, please let me know.'
    ];
  }

  if (tone === 'Custom') {
    return [
      'Thank you for your email.',
      'I am following up based on the details currently available in the thread.',
      'If you would like me to confirm anything specific, please let me know.'
    ];
  }

  return [
    'Thanks for your email.',
    'I have reviewed your message and am following up based on the details in the thread.',
    'Let me know if you would like me to confirm anything further.'
  ];
}

function buildClosing(styleProfile, signature) {
  const defaultClosing = 'Best regards,';
  const preferredClosing = Array.isArray(styleProfile.commonPhrases) && styleProfile.commonPhrases[1]
    ? styleProfile.commonPhrases[1]
    : defaultClosing;

  if (!signature) {
    return preferredClosing;
  }

  return `${preferredClosing}\n${signature}`;
}

function generateReplyDraft(email, tone, preferences, styleProfile = {}) {
  const greeting = buildGreeting(email.sender, tone);
  const bodyLines = buildBody(tone);
  const closing = buildClosing(styleProfile, preferences.signature || '');

  return [greeting, '', ...bodyLines, '', closing].join('\n');
}

module.exports = {
  generateReplyDraft
};
