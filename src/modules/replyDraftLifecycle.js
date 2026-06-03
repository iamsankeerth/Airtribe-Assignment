const {
  inboxRepo,
  outboxRepo,
  preferencesRepo,
  auditLogRepo
} = require('../database/repositories');
const writingIntelligence = require('./writingIntelligence');
const replyDraftEligibility = require('./replyDraftEligibility');
const sendQueue = require('./sendQueue');

function assertSendableEmail(email) {
  const eligibility = replyDraftEligibility.evaluate(email);
  if (!eligibility.canDraft) {
    throw new Error(eligibility.message);
  }
}

async function getOrCreateDraft(emailId) {
  const email = inboxRepo.findById(emailId);
  assertSendableEmail(email);

  let draft = outboxRepo.findByEmailId(emailId);
  if (!draft) {
    const preferences = preferencesRepo.get();
    const content = await writingIntelligence.generateReplyDraft({
      email,
      tone: preferences.defaultTone
    });
    draft = await outboxRepo.insert({
      emailId,
      threadId: email.threadId,
      content,
      tone: preferences.defaultTone,
      status: 'Suggested'
    });
  }

  return draft;
}

async function warmDraftForEmail(emailId) {
  try {
    return await getOrCreateDraft(emailId);
  } catch (err) {
    console.error(`Background draft pre-generation failed for email ${emailId}:`, err);
    return null;
  }
}

async function regenerateDraft(emailId, tone) {
  const email = inboxRepo.findById(emailId);
  assertSendableEmail(email);

  const content = await writingIntelligence.generateReplyDraft({ email, tone });
  let draft = outboxRepo.findByEmailId(emailId);

  if (draft) {
    draft = await outboxRepo.update(draft.id, {
      content,
      tone,
      status: 'Suggested',
      dispatchState: 'Idle',
      sendRequestKey: '',
      claimedAt: null,
      approvedAt: null,
      sentAt: null,
      nextAttemptAt: null,
      errorLog: ''
    });
  } else {
    draft = await outboxRepo.insert({
      emailId,
      threadId: email.threadId,
      content,
      tone,
      status: 'Suggested'
    });
  }

  return draft;
}

async function updateDraft(id, content) {
  const draft = outboxRepo.findById(id);
  if (!draft) {
    throw new Error('Draft not found.');
  }

  const updated = await outboxRepo.update(id, {
    content,
    status: 'Edited',
    dispatchState: 'Idle',
    sendRequestKey: '',
    claimedAt: null,
    approvedAt: null,
    sentAt: null,
    nextAttemptAt: null,
    errorLog: ''
  });

  await auditLogRepo.log('System', 'Info', `Draft ${id} manually modified by user.`);
  return updated;
}

async function approveDraft(id) {
  const draft = outboxRepo.findById(id);
  if (!draft) {
    throw new Error('Draft not found.');
  }

  const email = inboxRepo.findById(draft.emailId);
  assertSendableEmail(email);

  const sendRequestKey = sendQueue.buildSendRequestKey(draft, email);

  if (draft.sendRequestKey === sendRequestKey && ['Approved', 'QueuedForSend', 'Sending', 'Retrying', 'Sent'].includes(draft.status)) {
    await auditLogRepo.log('System', 'Info', `Draft ${id} already has an active send request key. Skipping duplicate approval.`);
    return draft;
  }

  await auditLogRepo.log('System', 'Info', `User approved Draft ${id}. Enqueueing message...`);

  const updated = await outboxRepo.update(id, {
    status: 'Approved',
    dispatchState: 'QueuedForSend',
    sendRequestKey,
    approvedAt: new Date().toISOString(),
    claimedAt: null,
    sentAt: null,
    nextAttemptAt: null,
    errorLog: ''
  });

  sendQueue.enqueueApprovedDraft(id);

  return updated;
}

async function rejectDraft(id) {
  const draft = outboxRepo.findById(id);
  if (!draft) {
    throw new Error('Draft not found.');
  }

  await auditLogRepo.log('System', 'Info', `User rejected Draft ${id}. Archiving draft.`);
  return outboxRepo.update(id, {
    status: 'Rejected',
    dispatchState: 'Idle',
    claimedAt: null,
    nextAttemptAt: null
  });
}

function listDrafts() {
  return outboxRepo.list();
}

module.exports = {
  listDrafts,
  getOrCreateDraft,
  warmDraftForEmail,
  regenerateDraft,
  updateDraft,
  approveDraft,
  rejectDraft
};
