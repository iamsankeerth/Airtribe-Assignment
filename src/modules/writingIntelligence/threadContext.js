function cleanBody(body, maxLength) {
  return (body || '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, maxLength);
}

function buildThreadHistoryPrompt(email, threadEmails, userEmail = '') {
  if (threadEmails.length > 0) {
    return threadEmails.map((threadEmail, index) => {
      const isSelf = userEmail && threadEmail.sender.toLowerCase().includes(userEmail);
      const role = isSelf ? 'USER (You)' : 'SENDER';

      return `[Message #${index + 1}]
Role: ${role}
From: ${threadEmail.sender}
Subject: ${threadEmail.subject}
Date: ${threadEmail.timestamp}
Content:
"""
${cleanBody(threadEmail.body, 1200)}
"""`;
    }).join('\n\n');
  }

  return `Single Email Content:
"""
${cleanBody(email.body, 1500)}
"""`;
}

module.exports = {
  buildThreadHistoryPrompt
};
