const {
  isNoReplySender,
  getNoReplyMessage,
  getSentFolderMessage
} = require('./shared/emailGuards');

function evaluate(email) {
  if (!email) {
    return {
      canDraft: false,
      reason: 'missing-email',
      message: 'Email not found.'
    };
  }

  if (isNoReplySender(email.sender)) {
    return {
      canDraft: false,
      reason: 'no-reply',
      message: getNoReplyMessage(email.sender)
    };
  }

  if ((email.folder || 'inbox') === 'sent') {
    return {
      canDraft: false,
      reason: 'sent',
      message: getSentFolderMessage()
    };
  }

  return {
    canDraft: true,
    reason: null,
    message: null
  };
}

module.exports = {
  evaluate
};
