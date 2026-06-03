function extractEmailAddress(sender = '') {
  const match = sender.match(/<([^>]+)>/);
  return (match ? match[1] : sender).trim().toLowerCase();
}

function isNoReplySender(sender = '') {
  const emailAddress = extractEmailAddress(sender);
  return /\b(no[\s._-]?reply|do[\s._-]?not[\s._-]?reply|donotreply)\b/i.test(emailAddress);
}

function getNoReplyMessage(sender = '') {
  return `This is a no-reply email ID (${extractEmailAddress(sender)}). You will not get a reply from this email ID.`;
}

function isIncomingReplyCandidate(email) {
  return Boolean(email) && (email.folder || 'inbox') !== 'sent' && !isNoReplySender(email.sender);
}

function getSentFolderMessage() {
  return 'Reply drafting is available only for received emails. This message is from Sent.';
}

module.exports = {
  extractEmailAddress,
  isNoReplySender,
  getNoReplyMessage,
  isIncomingReplyCandidate,
  getSentFolderMessage
};
