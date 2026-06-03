const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const dbPath = path.join(repoRoot, 'data', 'db.json');
const keyPath = path.join(repoRoot, 'data', '.draftly.key');
const backupDir = path.join(repoRoot, 'scratch', 'test-backups');
const dbBackupPath = path.join(backupDir, 'db.json.bak');
const keyBackupPath = path.join(backupDir, '.draftly.key.bak');

let db;
let replyDraftLifecycle;
let gmailService;
let writingIntelligence;
let profilePreferences;
let sentEmailRepo;
let sendQueue;
let createApp;

function backupFile(sourcePath, targetPath) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  if (fs.existsSync(sourcePath)) {
    fs.copyFileSync(sourcePath, targetPath);
  } else if (fs.existsSync(targetPath)) {
    fs.unlinkSync(targetPath);
  }
}

function restoreFile(sourcePath, targetPath) {
  if (fs.existsSync(sourcePath)) {
    fs.copyFileSync(sourcePath, targetPath);
  } else if (fs.existsSync(targetPath)) {
    fs.unlinkSync(targetPath);
  }
}

async function withServer(app) {
  const server = await new Promise(resolve => {
    const instance = app.listen(0, () => resolve(instance));
  });

  return {
    server,
    baseUrl: `http://127.0.0.1:${server.address().port}`
  };
}

test.before(() => {
  backupFile(dbPath, dbBackupPath);
  backupFile(keyPath, keyBackupPath);

  process.env.ENCRYPTION_KEY = 'draftly-test-encryption-key';
  process.env.PORT = '5099';
  delete process.env.GMAIL_REDIRECT_URI;

  db = require('../src/database/db');
  replyDraftLifecycle = require('../src/modules/replyDraftLifecycle');
  gmailService = require('../src/services/gmail');
  writingIntelligence = require('../src/modules/writingIntelligence');
  profilePreferences = require('../src/modules/profilePreferences');
  ({ sentEmailRepo } = require('../src/database/repositories'));
  sendQueue = require('../src/modules/sendQueue');
  ({ createApp } = require('../server'));

  db.resetToDefaults();
});

test.after(() => {
  restoreFile(dbBackupPath, dbPath);
  restoreFile(keyBackupPath, keyPath);
});

test.beforeEach(() => {
  if (sendQueue && sendQueue._resetForTests) {
    sendQueue._resetForTests();
  }
  db.resetToDefaults();
  db.set('emails', []);
  db.set('drafts', []);
  db.set('sentEmails', []);
});

test('preferences are encrypted at rest and still readable through the module API', async () => {
  const saved = await profilePreferences.savePreferences({
    defaultTone: 'Formal',
    signature: 'Sankeerth',
    customInstructions: 'Keep replies short and factual.'
  });

  assert.equal(saved.defaultTone, 'Formal');

  const rawDb = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  assert.equal(typeof rawDb.preferences, 'string');
  assert.match(rawDb.preferences, /^v2:/);
  assert.doesNotMatch(rawDb.preferences, /Keep replies short and factual\./);

  const preferences = db.getDecryptedPreferences();
  assert.equal(preferences.signature, 'Sankeerth');
  assert.equal(preferences.customInstructions, 'Keep replies short and factual.');
});

test('sent emails are blocked from reply drafting in the lifecycle module', async () => {
  await db.insert('emails', {
    id: 'email-sent-1',
    threadId: 'thread-sent-1',
    sender: 'Sankeerth Masetty <sankeerthmvsr@gmail.com>',
    recipient: 'Recruiter <recruiter@example.com>',
    subject: 'Application follow-up',
    body: 'Following up on my application.',
    snippet: 'Following up',
    timestamp: new Date().toISOString(),
    isRead: true,
    folder: 'sent'
  });

  await assert.rejects(
    () => replyDraftLifecycle.getOrCreateDraft('email-sent-1'),
    /Reply drafting is available only for received emails/
  );
});

test('draft creation route keeps the incoming-only guard for sent mail', async () => {
  await db.insert('emails', {
    id: 'email-sent-route',
    threadId: 'thread-sent-route',
    sender: 'Sankeerth Masetty <sankeerthmvsr@gmail.com>',
    recipient: 'Recruiter <recruiter@example.com>',
    subject: 'Portfolio follow-up',
    body: 'Checking in on my previous email.',
    snippet: 'Checking in',
    timestamp: new Date().toISOString(),
    isRead: true,
    folder: 'sent'
  });

  const { server, baseUrl } = await withServer(createApp());

  try {
    const response = await fetch(`${baseUrl}/api/drafts/email-sent-route`);
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.match(payload.error, /Reply drafting is available only for received emails/);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('email list route includes backend-owned reply eligibility', async () => {
  await db.insert('emails', {
    id: 'email-no-reply',
    threadId: 'thread-no-reply',
    sender: 'No Reply <noreply@example.com>',
    recipient: 'owner@example.com',
    subject: 'Automated update',
    body: 'Status update only.',
    snippet: 'Status update only.',
    timestamp: new Date().toISOString(),
    isRead: false,
    folder: 'inbox'
  });

  const { server, baseUrl } = await withServer(createApp());

  try {
    const response = await fetch(`${baseUrl}/api/emails?folder=inbox`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload[0].replyEligibility.canDraft, false);
    assert.equal(payload[0].replyEligibility.reason, 'no-reply');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('OAuth redirect URI follows runtime configuration', () => {
  delete process.env.GMAIL_REDIRECT_URI;
  process.env.PORT = '6123';
  assert.equal(gmailService.getRedirectUri(), 'http://localhost:6123/api/auth/callback');

  process.env.GMAIL_REDIRECT_URI = 'https://example.com/oauth/google/callback';
  assert.equal(gmailService.getRedirectUri(), 'https://example.com/oauth/google/callback');
});

test('settings page includes Google OAuth client credential inputs', () => {
  const indexHtml = fs.readFileSync(path.join(repoRoot, 'public', 'index.html'), 'utf8');

  assert.match(indexHtml, /id="clientId"/);
  assert.match(indexHtml, /id="clientSecret"/);
});

test('config save route persists Google OAuth credentials for auth URL generation', async () => {
  process.env.GMAIL_REDIRECT_URI = 'https://airtribe-assignment.onrender.com/api/auth/callback';

  const { server, baseUrl } = await withServer(createApp());

  try {
    const saveResponse = await fetch(`${baseUrl}/api/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: 'render-client-id.apps.googleusercontent.com',
        clientSecret: 'render-client-secret'
      })
    });
    const savePayload = await saveResponse.json();

    assert.equal(saveResponse.status, 200);
    assert.equal(savePayload.success, true);

    const authUrlResponse = await fetch(`${baseUrl}/api/auth/url`);
    const authPayload = await authUrlResponse.json();

    assert.equal(authUrlResponse.status, 200);
    assert.match(authPayload.url, /^https:\/\/accounts\.google\.com\//);
    assert.match(authPayload.url, /redirect_uri=https%3A%2F%2Fairtribe-assignment\.onrender\.com%2Fapi%2Fauth%2Fcallback/);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('approved sends persist a final sent-email record', async () => {
  const credentials = db.get('credentials');
  credentials.userEmail = 'owner@example.com';
  credentials.aiProvider = 'gemini';
  db.set('credentials', credentials);

  await db.insert('emails', {
    id: 'email-inbox-1',
    threadId: 'thread-inbox-1',
    sender: 'Hiring Team <jobs@example.com>',
    recipient: 'owner@example.com',
    subject: 'Interview availability',
    body: 'Could you share your availability for next week?',
    snippet: 'Could you share your availability',
    timestamp: new Date().toISOString(),
    isRead: false,
    folder: 'inbox'
  });

  const originalGenerator = writingIntelligence.generateReplyDraft;
  const originalSendReply = gmailService.sendReply;

  writingIntelligence.generateReplyDraft = async () => 'Hi,\n\nNext Tuesday works well for me.\n\nBest regards,\nOwner';
  gmailService.sendReply = async () => ({
    messageId: 'gmail-message-123',
    threadId: 'thread-inbox-1',
    replySubject: 'Re: Interview availability',
    status: 'success'
  });

  try {
    const draft = await replyDraftLifecycle.getOrCreateDraft('email-inbox-1');
    await db.updateById('drafts', draft.id, {
      status: 'Approved',
      errorLog: ''
    });
    await sendQueue.processPending();

    const sentEmails = sentEmailRepo.list();
    assert.equal(sentEmails.length, 1);
    assert.equal(sentEmails[0].draftId, draft.id);
    assert.equal(sentEmails[0].gmailMessageId, 'gmail-message-123');
    assert.equal(sentEmails[0].subject, 'Re: Interview availability');
    assert.equal(sentEmails[0].to, 'Hiring Team <jobs@example.com>');
  } finally {
    writingIntelligence.generateReplyDraft = originalGenerator;
    gmailService.sendReply = originalSendReply;
  }
});

test('duplicate approvals reuse the same send request key and only enqueue once', async () => {
  const credentials = db.get('credentials');
  credentials.userEmail = 'owner@example.com';
  credentials.aiProvider = 'gemini';
  db.set('credentials', credentials);

  await db.insert('emails', {
    id: 'email-inbox-idempotent',
    threadId: 'thread-inbox-idempotent',
    sender: 'Hiring Team <jobs@example.com>',
    recipient: 'owner@example.com',
    subject: 'Availability check',
    body: 'What times work best for you this week?',
    snippet: 'What times work best for you this week?',
    timestamp: new Date().toISOString(),
    isRead: false,
    folder: 'inbox'
  });

  const originalGenerator = writingIntelligence.generateReplyDraft;
  const originalEnqueue = sendQueue.enqueueApprovedDraft;
  let enqueueCount = 0;

  writingIntelligence.generateReplyDraft = async () => 'Hi,\n\nTuesday or Wednesday afternoon works best for me.\n\nBest regards,\nOwner';
  sendQueue.enqueueApprovedDraft = () => {
    enqueueCount += 1;
  };

  try {
    const firstApproval = await replyDraftLifecycle.getOrCreateDraft('email-inbox-idempotent');
    const approvedOnce = await replyDraftLifecycle.approveDraft(firstApproval.id);
    const approvedTwice = await replyDraftLifecycle.approveDraft(firstApproval.id);

    assert.ok(approvedOnce.sendRequestKey);
    assert.equal(approvedOnce.sendRequestKey, approvedTwice.sendRequestKey);
    assert.equal(enqueueCount, 1);
  } finally {
    writingIntelligence.generateReplyDraft = originalGenerator;
    sendQueue.enqueueApprovedDraft = originalEnqueue;
  }
});

test('regenerating a draft clears the previous send request identity', async () => {
  const credentials = db.get('credentials');
  credentials.userEmail = 'owner@example.com';
  credentials.aiProvider = 'gemini';
  db.set('credentials', credentials);

  await db.insert('emails', {
    id: 'email-regenerate-1',
    threadId: 'thread-regenerate-1',
    sender: 'Hiring Team <jobs@example.com>',
    recipient: 'owner@example.com',
    subject: 'Reschedule request',
    body: 'Could you suggest another time for the interview?',
    snippet: 'Could you suggest another time for the interview?',
    timestamp: new Date().toISOString(),
    isRead: false,
    folder: 'inbox'
  });

  const originalGenerator = writingIntelligence.generateReplyDraft;
  const originalEnqueue = sendQueue.enqueueApprovedDraft;
  let callCount = 0;

  writingIntelligence.generateReplyDraft = async () => {
    callCount += 1;
    return callCount === 1
      ? 'Hi,\n\nTuesday afternoon works for me.\n\nBest regards,\nOwner'
      : 'Hi,\n\nThursday morning would work better for me.\n\nBest regards,\nOwner';
  };
  sendQueue.enqueueApprovedDraft = () => {};

  try {
    const draft = await replyDraftLifecycle.getOrCreateDraft('email-regenerate-1');
    const approved = await replyDraftLifecycle.approveDraft(draft.id);

    const regenerated = await replyDraftLifecycle.regenerateDraft('email-regenerate-1', 'Formal');

    assert.ok(approved.sendRequestKey);
    assert.equal(regenerated.sendRequestKey, '');
    assert.equal(regenerated.dispatchState, 'Idle');
    assert.equal(regenerated.status, 'Suggested');
  } finally {
    writingIntelligence.generateReplyDraft = originalGenerator;
    sendQueue.enqueueApprovedDraft = originalEnqueue;
  }
});

test('quota rate-limit failures get a longer retry window', async () => {
  const credentials = db.get('credentials');
  credentials.userEmail = 'owner@example.com';
  credentials.aiProvider = 'gemini';
  db.set('credentials', credentials);

  await db.insert('emails', {
    id: 'email-quota-1',
    threadId: 'thread-quota-1',
    sender: 'Hiring Team <jobs@example.com>',
    recipient: 'owner@example.com',
    subject: 'Interview slot',
    body: 'Please send a time that works for you.',
    snippet: 'Please send a time that works for you.',
    timestamp: new Date().toISOString(),
    isRead: false,
    folder: 'inbox'
  });

  const originalGenerator = writingIntelligence.generateReplyDraft;
  const originalSendReply = gmailService.sendReply;

  writingIntelligence.generateReplyDraft = async () => 'Hi,\n\nI am available Thursday afternoon.\n\nBest regards,\nOwner';
  gmailService.sendReply = async () => {
    const err = new Error('rateLimitExceeded: Too many requests');
    err.code = 429;
    throw err;
  };

  try {
    const draft = await replyDraftLifecycle.getOrCreateDraft('email-quota-1');
    await db.updateById('drafts', draft.id, {
      status: 'Approved',
      dispatchState: 'QueuedForSend',
      errorLog: ''
    });

    const before = Date.now();
    await sendQueue.processPending();

    const updated = db.findById('drafts', draft.id);
    assert.equal(updated.status, 'Retrying');
    assert.ok(updated.nextAttemptAt - before >= 60000);
  } finally {
    writingIntelligence.generateReplyDraft = originalGenerator;
    gmailService.sendReply = originalSendReply;
  }
});

test('repeated quota errors pause the queue and defer other approved sends', async () => {
  const credentials = db.get('credentials');
  credentials.userEmail = 'owner@example.com';
  credentials.aiProvider = 'gemini';
  db.set('credentials', credentials);

  await db.insert('emails', {
    id: 'email-quota-a',
    threadId: 'thread-quota-a',
    sender: 'Hiring Team <jobs@example.com>',
    recipient: 'owner@example.com',
    subject: 'First scheduling email',
    body: 'Please suggest a time for the first meeting.',
    snippet: 'Please suggest a time for the first meeting.',
    timestamp: new Date().toISOString(),
    isRead: false,
    folder: 'inbox'
  });

  await db.insert('emails', {
    id: 'email-quota-b',
    threadId: 'thread-quota-b',
    sender: 'Recruiter <recruiter@example.com>',
    recipient: 'owner@example.com',
    subject: 'Second scheduling email',
    body: 'Please suggest a time for the second meeting.',
    snippet: 'Please suggest a time for the second meeting.',
    timestamp: new Date().toISOString(),
    isRead: false,
    folder: 'inbox'
  });

  await db.insert('emails', {
    id: 'email-quota-c',
    threadId: 'thread-quota-c',
    sender: 'Coordinator <coord@example.com>',
    recipient: 'owner@example.com',
    subject: 'Third scheduling email',
    body: 'Please suggest a time for the third meeting.',
    snippet: 'Please suggest a time for the third meeting.',
    timestamp: new Date().toISOString(),
    isRead: false,
    folder: 'inbox'
  });

  const originalGenerator = writingIntelligence.generateReplyDraft;
  const originalSendReply = gmailService.sendReply;
  let sendCount = 0;

  writingIntelligence.generateReplyDraft = async ({ email }) => `Hi,\n\nA time works for ${email.subject}.\n\nBest regards,\nOwner`;
  gmailService.sendReply = async () => {
    sendCount += 1;
    const err = new Error('rateLimitExceeded: Too many requests');
    err.code = 429;
    throw err;
  };

  try {
    const draftA = await replyDraftLifecycle.getOrCreateDraft('email-quota-a');
    const draftB = await replyDraftLifecycle.getOrCreateDraft('email-quota-b');
    const draftC = await replyDraftLifecycle.getOrCreateDraft('email-quota-c');

    await db.updateById('drafts', draftA.id, { status: 'Approved', dispatchState: 'QueuedForSend' });
    await db.updateById('drafts', draftB.id, { status: 'Approved', dispatchState: 'QueuedForSend' });
    await db.updateById('drafts', draftC.id, { status: 'Approved', dispatchState: 'QueuedForSend' });

    await sendQueue.processPending();
    await sendQueue.processPending();

    const updatedC = db.findById('drafts', draftC.id);
    assert.equal(sendCount, 2);
    assert.equal(updatedC.status, 'Approved');
    assert.equal(updatedC.dispatchState, 'QueuedForSend');
  } finally {
    writingIntelligence.generateReplyDraft = originalGenerator;
    gmailService.sendReply = originalSendReply;
  }
});

test('existing sent-email records prevent duplicate Gmail sends for the same request key', async () => {
  const credentials = db.get('credentials');
  credentials.userEmail = 'owner@example.com';
  credentials.aiProvider = 'gemini';
  db.set('credentials', credentials);

  await db.insert('emails', {
    id: 'email-dedupe-1',
    threadId: 'thread-dedupe-1',
    sender: 'Hiring Team <jobs@example.com>',
    recipient: 'owner@example.com',
    subject: 'Quick follow-up',
    body: 'Could you confirm your availability?',
    snippet: 'Could you confirm your availability?',
    timestamp: new Date().toISOString(),
    isRead: false,
    folder: 'inbox'
  });

  const originalGenerator = writingIntelligence.generateReplyDraft;
  const originalSendReply = gmailService.sendReply;
  let sendCount = 0;

  writingIntelligence.generateReplyDraft = async () => 'Hi,\n\nFriday morning works well for me.\n\nBest regards,\nOwner';
  gmailService.sendReply = async () => {
    sendCount += 1;
    return {
      messageId: 'gmail-message-dedupe',
      threadId: 'thread-dedupe-1',
      replySubject: 'Re: Quick follow-up',
      status: 'success'
    };
  };

  try {
    const draft = await replyDraftLifecycle.getOrCreateDraft('email-dedupe-1');
    const sendRequestKey = sendQueue.buildSendRequestKey(draft, db.findById('emails', 'email-dedupe-1'));

    await db.updateById('drafts', draft.id, {
      status: 'Approved',
      dispatchState: 'QueuedForSend',
      sendRequestKey,
      errorLog: ''
    });

    await sentEmailRepo.insert({
      draftId: draft.id,
      emailId: draft.emailId,
      threadId: draft.threadId,
      sendRequestKey,
      gmailMessageId: 'gmail-message-dedupe',
      to: 'Hiring Team <jobs@example.com>',
      from: 'owner@example.com',
      subject: 'Re: Quick follow-up',
      body: 'Hi,\n\nFriday morning works well for me.\n\nBest regards,\nOwner',
      tone: 'Concise',
      provider: 'gemini',
      sentAt: new Date().toISOString()
    });

    await sendQueue.processPending();

    const updated = db.findById('drafts', draft.id);
    assert.equal(sendCount, 0);
    assert.equal(updated.status, 'Sent');
    assert.equal(updated.messageId, 'gmail-message-dedupe');
  } finally {
    writingIntelligence.generateReplyDraft = originalGenerator;
    gmailService.sendReply = originalSendReply;
  }
});

test('heuristic fallback stays conservative and does not invent process updates', async () => {
  const credentials = db.get('credentials');
  credentials.geminiApiKey = '';
  credentials.aiProvider = 'gemini';
  db.set('credentials', credentials);

  const draft = await writingIntelligence.generateReplyDraft({
    email: {
      id: 'email-inbox-2',
      threadId: 'thread-inbox-2',
      sender: 'Recruiter <jobs@example.com>',
      recipient: 'owner@example.com',
      subject: 'Application for AI Engineer',
      body: 'Thanks for reaching out. Could you share a suitable interview time next week?',
      snippet: 'Could you share a suitable interview time next week?',
      timestamp: new Date().toISOString(),
      folder: 'inbox'
    },
    tone: 'Concise'
  });

  assert.doesNotMatch(draft, /we have received your resume/i);
  assert.doesNotMatch(draft, /we are reviewing applications/i);
  assert.match(draft, /Thanks for your email|Thank you for your email/i);
});
