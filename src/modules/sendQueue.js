const crypto = require('crypto');
const {
  inboxRepo,
  outboxRepo,
  sentEmailRepo,
  credentialsRepo,
  auditLogRepo
} = require('../database/repositories');
const gmailService = require('../services/gmail');
const gmailQuota = require('./gmailQuota');

let isProcessing = false;
const activeLocks = new Set();
let intervalId = null;
const SEND_CLAIM_TTL_MS = 2 * 60 * 1000;
let queueCooldownUntil = 0;
let consecutiveQuotaErrors = 0;
let lastCooldownNoticeUntil = 0;

function buildSendRequestKey(draft, email = {}) {
  const contentHash = crypto.createHash('sha256').update(String(draft.content || ''), 'utf8').digest('hex');
  const payload = {
    draftId: draft.id || '',
    emailId: draft.emailId || '',
    threadId: email.threadId || draft.threadId || '',
    tone: draft.tone || '',
    contentHash
  };

  return `send-v1:${crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`;
}

function getRetryDelayMs(error, attempt) {
  if (gmailQuota.isQuotaError(error)) {
    return gmailQuota.getRetryDelayMs(error, attempt);
  }

  return Math.pow(2, attempt - 1) * 5 * 1000;
}

function isRecoverableSendingDraft(draft, now) {
  if (draft.status !== 'Sending' || !draft.claimedAt) {
    return false;
  }

  const claimedAt = new Date(draft.claimedAt).getTime();
  if (Number.isNaN(claimedAt)) {
    return true;
  }

  return now - claimedAt >= SEND_CLAIM_TTL_MS;
}

function isQueueCoolingDown(now = Date.now()) {
  return queueCooldownUntil > now;
}

async function logQueueCooldownIfNeeded(now = Date.now()) {
  if (!isQueueCoolingDown(now) || lastCooldownNoticeUntil === queueCooldownUntil) {
    return;
  }

  const remainingMs = queueCooldownUntil - now;
  lastCooldownNoticeUntil = queueCooldownUntil;
  await auditLogRepo.log(
    'Queue',
    'Info',
    `Send Queue is cooling down for ${Math.ceil(remainingMs / 1000)}s after repeated Gmail quota pressure.`
  );
}

function activateQueueCooldown(durationMs) {
  if (!durationMs || durationMs <= 0) {
    return;
  }

  queueCooldownUntil = Math.max(queueCooldownUntil, Date.now() + durationMs);
}

function clearQuotaRuntimeState() {
  queueCooldownUntil = 0;
  consecutiveQuotaErrors = 0;
  lastCooldownNoticeUntil = 0;
}

async function processDraftSend(draft) {
  const email = inboxRepo.findById(draft.emailId);
  const sendRequestKey = draft.sendRequestKey || buildSendRequestKey(draft, email || {});

  if (!email) {
    await auditLogRepo.log('Queue', 'Error', `Orphaned draft ${draft.id}: Matching email ${draft.emailId} not found. Archiving draft.`);
    await outboxRepo.update(draft.id, { status: 'Rejected', dispatchState: 'Failed', errorLog: 'Original email not found.' });
    return;
  }

  const existingSent = sentEmailRepo.findBySendRequestKey(sendRequestKey);
  if (existingSent) {
    await auditLogRepo.log('Queue', 'Info', `Duplicate send request detected for Draft: ${draft.id}. Reusing persisted sent-email record.`);
    await outboxRepo.update(draft.id, {
      status: 'Sent',
      dispatchState: 'Completed',
      sendRequestKey,
      sentAt: existingSent.sentAt || new Date().toISOString(),
      messageId: existingSent.gmailMessageId || existingSent.messageId || '',
      errorLog: ''
    });
    await inboxRepo.markAsRead(email.id);
    return;
  }

  if (draft.status === 'Sending') {
    await auditLogRepo.log('Queue', 'Warning', `Recovering stale in-flight send claim for Draft: ${draft.id}. Reclaiming dispatch lock.`);
  }

  await auditLogRepo.log('Queue', 'Info', `Processing transmission lock for Draft: ${draft.id}`);
  await outboxRepo.update(draft.id, {
    status: 'Sending',
    dispatchState: 'Sending',
    claimedAt: new Date().toISOString(),
    nextAttemptAt: null,
    sendRequestKey,
    errorLog: ''
  });

  try {
    const sendResult = await gmailService.sendReply(
      draft.content,
      email.threadId,
      email.subject,
      email.sender
    );

    const creds = credentialsRepo.getDecrypted();
    const sentRecord = await sentEmailRepo.insert({
      draftId: draft.id,
      emailId: email.id,
      threadId: email.threadId,
      sendRequestKey,
      gmailMessageId: sendResult.messageId,
      to: email.sender,
      from: creds.userEmail,
      subject: sendResult.replySubject,
      body: draft.content,
      tone: draft.tone,
      provider: (creds.aiProvider || 'gemini').toLowerCase(),
      sentAt: new Date().toISOString()
    });

    await outboxRepo.update(draft.id, {
      status: 'Sent',
      dispatchState: 'Completed',
      sentAt: new Date().toISOString(),
      claimedAt: null,
      nextAttemptAt: null,
      messageId: sentRecord.gmailMessageId || sendResult.messageId,
      errorLog: ''
    });

    await inboxRepo.markAsRead(email.id);
    clearQuotaRuntimeState();
    await auditLogRepo.log('Queue', 'Info', `Successfully processed send event for Draft: ${draft.id}. Message dispatched!`);
  } catch (err) {
    const errorMessage = err.message || 'Unknown network error';
    await auditLogRepo.log('Queue', 'Warning', `Send attempt failed for Draft: ${draft.id} - Error: ${errorMessage}`);

    const errorClass = gmailQuota.classifyError(err);

    if (errorClass === 'auth') {
      await auditLogRepo.log('Queue', 'Error', 'Fatal Authentication failure detected. Halting queue and notifying client.');

      await outboxRepo.update(draft.id, {
        status: 'Failed',
        dispatchState: 'Failed',
        claimedAt: null,
        nextAttemptAt: null,
        errorLog: `Fatal Auth Error: ${errorMessage}. Please reconnect your Gmail account.`
      });

      await credentialsRepo.update(creds => {
        creds.isConnected = false;
        return creds;
      });

      clearQuotaRuntimeState();
      await auditLogRepo.log('System', 'Error', 'USER ALERT: Gmail account disconnected due to expired or revoked OAuth2 tokens.');
      return;
    }

    const nextRetryCount = (draft.retryCount || 0) + 1;

    if (nextRetryCount >= 5) {
      await auditLogRepo.log('Queue', 'Error', `Exceeded maximum retry attempts (5/5) for Draft: ${draft.id}. Halting.`);
      await outboxRepo.update(draft.id, {
        status: 'Failed',
        dispatchState: 'Failed',
        retryCount: nextRetryCount,
        claimedAt: null,
        nextAttemptAt: null,
        errorLog: `Exceeded maximum send attempts. Last error: ${errorMessage}`
      });
      return;
    }

    const backoffMs = getRetryDelayMs(err, nextRetryCount);
    const backoffSec = Math.ceil(backoffMs / 1000);
    const nextAttemptTime = Date.now() + backoffMs;

    if (errorClass === 'quota') {
      consecutiveQuotaErrors += 1;
      if (consecutiveQuotaErrors >= 2) {
        activateQueueCooldown(backoffMs);
        await auditLogRepo.log(
          'Queue',
          'Warning',
          `Repeated Gmail quota errors detected. Pausing the send queue for ${backoffSec}s before more dispatch attempts.`
        );
      }
    } else {
      consecutiveQuotaErrors = 0;
    }

    await auditLogRepo.log('Queue', 'Info', `Draft ${draft.id} scheduled for retry #${nextRetryCount} in ${backoffSec} seconds (at ${new Date(nextAttemptTime).toLocaleTimeString()}).`);
    await outboxRepo.update(draft.id, {
      status: 'Retrying',
      dispatchState: 'QueuedForSend',
      retryCount: nextRetryCount,
      claimedAt: null,
      errorLog: `Attempt #${nextRetryCount} failed: ${errorMessage}. Next retry in ${backoffSec}s.`,
      nextAttemptAt: nextAttemptTime
    });
  }
}

async function processPending() {
  if (isProcessing) return;
  isProcessing = true;

  try {
    const now = Date.now();
    if (isQueueCoolingDown(now)) {
      await logQueueCooldownIfNeeded(now);
      return;
    }

    const pendingDrafts = outboxRepo.list().filter(draft => {
      if (draft.status === 'Approved' && draft.dispatchState !== 'Sending') {
        return true;
      }

      if (draft.status === 'Retrying' && (draft.nextAttemptAt && now >= draft.nextAttemptAt)) {
        return draft.dispatchState !== 'Sending';
      }

      return isRecoverableSendingDraft(draft, now);
    });

    if (pendingDrafts.length > 0) {
      await auditLogRepo.log('Queue', 'Info', `Found ${pendingDrafts.length} pending draft(s) in sending queue.`);
    }

    for (const draft of pendingDrafts) {
      if (isQueueCoolingDown()) {
        await logQueueCooldownIfNeeded();
        break;
      }

      if (activeLocks.has(draft.id)) {
        continue;
      }

      activeLocks.add(draft.id);
      try {
        await processDraftSend(draft);
      } catch (err) {
        console.error(`Error processing draft ${draft.id} in queue:`, err);
      } finally {
        activeLocks.delete(draft.id);
      }
    }
  } catch (err) {
    console.error('Queue processing cycle error:', err);
  } finally {
    isProcessing = false;
  }
}

function enqueueApprovedDraft() {
  processPending().catch(err => {
    console.error('Immediate queue processing failed:', err);
  });
}

function start() {
  processPending();

  if (intervalId) {
    clearInterval(intervalId);
  }

  intervalId = setInterval(() => {
    const now = Date.now();
    const hasEligibleDrafts = outboxRepo.list().some(draft =>
      draft.status === 'Approved' ||
      (draft.status === 'Retrying' && draft.nextAttemptAt && now >= draft.nextAttemptAt) ||
      isRecoverableSendingDraft(draft, now)
    );

    if (hasEligibleDrafts) {
      processPending();
    }
  }, 5000);

  auditLogRepo.log('System', 'Info', 'Send Queue background daemon started.');
}

function stop() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    auditLogRepo.log('System', 'Info', 'Send Queue stopped.');
  }
}

module.exports = {
  enqueueApprovedDraft,
  processPending,
  start,
  stop,
  buildSendRequestKey,
  _resetForTests() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    isProcessing = false;
    activeLocks.clear();
    clearQuotaRuntimeState();
  }
};
