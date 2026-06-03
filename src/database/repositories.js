const db = require('./db');
const { v4: uuidv4 } = require('uuid');

class InboxRepository {
  list(folder = 'inbox') {
    const emails = db.findAll('emails');
    const filtered = emails.filter(email => {
      if (folder === 'all') return true;
      const emailFolder = email.folder || 'inbox';
      return emailFolder === folder;
    });

    return [...filtered].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  listAll() {
    return db.findAll('emails');
  }

  clearAll() {
    db.set('emails', []);
  }

  findById(id) {
    return db.findById('emails', id);
  }

  findByThreadId(threadId) {
    return db.findAll('emails').filter(email => email.threadId === threadId);
  }

  async insert(email) {
    const requiredFields = ['id', 'threadId', 'sender', 'recipient', 'subject', 'body', 'snippet', 'timestamp'];
    for (const field of requiredFields) {
      if (email[field] === undefined) {
        throw new Error(`Invalid Inbox Email: Missing required field "${field}"`);
      }
    }

    const existing = db.findById('emails', email.id);
    if (existing) {
      return existing;
    }

    const item = {
      ...email,
      isRead: email.isRead !== undefined ? email.isRead : false,
      createdAt: email.createdAt || new Date().toISOString()
    };

    await db.insert('emails', item);
    return item;
  }

  async upsertSynced(email) {
    const existing = this.findById(email.id);
    if (existing) {
      return db.updateById('emails', email.id, {
        ...email,
        createdAt: existing.createdAt || email.createdAt || new Date().toISOString()
      });
    }

    return this.insert(email);
  }

  async markAsRead(id) {
    return db.updateById('emails', id, { isRead: true });
  }
}

class OutboxRepository {
  list() {
    return db.findAll('drafts');
  }

  findById(id) {
    return db.findById('drafts', id);
  }

  findByEmailId(emailId) {
    return db.findOne('drafts', { emailId });
  }

  findBySendRequestKey(sendRequestKey) {
    return db.findOne('drafts', { sendRequestKey });
  }

  async insert(draft) {
    const requiredFields = ['emailId', 'threadId', 'content', 'tone'];
    for (const field of requiredFields) {
      if (draft[field] === undefined) {
        throw new Error(`Invalid Reply Draft: Missing required field "${field}"`);
      }
    }

    const item = {
      id: draft.id || ('draft-' + uuidv4().substring(0, 8)),
      emailId: draft.emailId,
      threadId: draft.threadId,
      content: draft.content,
      tone: draft.tone,
      status: draft.status || 'Suggested',
      retryCount: draft.retryCount !== undefined ? draft.retryCount : 0,
      dispatchState: draft.dispatchState || 'Idle',
      sendRequestKey: draft.sendRequestKey || '',
      approvedAt: draft.approvedAt || null,
      claimedAt: draft.claimedAt || null,
      sentAt: draft.sentAt || null,
      nextAttemptAt: draft.nextAttemptAt || null,
      errorLog: draft.errorLog || '',
      createdAt: draft.createdAt || new Date().toISOString(),
      updatedAt: draft.updatedAt || new Date().toISOString()
    };

    await db.insert('drafts', item);
    return item;
  }

  async update(id, updates) {
    return db.updateById('drafts', id, {
      ...updates,
      updatedAt: new Date().toISOString()
    });
  }

  listPending() {
    const drafts = db.findAll('drafts');
    return drafts.filter(
      draft => (draft.status === 'Approved' || draft.status === 'Retrying') && (draft.retryCount || 0) < 5
    );
  }

  clearAll() {
    db.set('drafts', []);
  }
}

class SentEmailRepository {
  list() {
    return db.findAll('sentEmails');
  }

  findByDraftId(draftId) {
    return db.findOne('sentEmails', { draftId });
  }

  findBySendRequestKey(sendRequestKey) {
    return db.findOne('sentEmails', { sendRequestKey });
  }

  async insert(sentEmail) {
    if (sentEmail.sendRequestKey) {
      const existing = this.findBySendRequestKey(sentEmail.sendRequestKey);
      if (existing) {
        return existing;
      }
    }

    const item = {
      id: sentEmail.id || ('sent-' + uuidv4().substring(0, 8)),
      draftId: sentEmail.draftId,
      emailId: sentEmail.emailId,
      threadId: sentEmail.threadId,
      sendRequestKey: sentEmail.sendRequestKey || '',
      gmailMessageId: sentEmail.gmailMessageId,
      to: sentEmail.to,
      from: sentEmail.from,
      subject: sentEmail.subject,
      body: sentEmail.body,
      tone: sentEmail.tone,
      provider: sentEmail.provider || 'unknown',
      sentAt: sentEmail.sentAt || new Date().toISOString(),
      createdAt: sentEmail.createdAt || new Date().toISOString()
    };

    await db.insert('sentEmails', item);
    return item;
  }
}

class CredentialsRepository {
  get() {
    return db.get('credentials');
  }

  getDecrypted() {
    return db.getDecryptedCredentials();
  }

  async save(credentials) {
    await db.saveEncryptedCredentials(credentials);
    return this.get();
  }

  async update(mutator) {
    const current = this.get();
    const next = typeof mutator === 'function' ? mutator({ ...current }) : { ...current, ...mutator };
    await db.saveEncryptedCredentials(next);
    return this.get();
  }

  async clearSession() {
    const current = this.get();
    current.accessToken = '';
    current.refreshToken = '';
    current.tokenExpiry = 0;
    current.isConnected = false;
    await db.saveEncryptedCredentials(current);
    return this.get();
  }
}

class PreferencesRepository {
  get() {
    return db.getDecryptedPreferences();
  }

  async save(preferences) {
    return db.saveEncryptedPreferences(preferences);
  }

  async update(mutator) {
    const current = this.get();
    const next = typeof mutator === 'function' ? mutator({ ...current }) : { ...current, ...mutator };
    return db.saveEncryptedPreferences(next);
  }
}

class AuditLogRepository {
  async log(category, severity, message) {
    return db.log(category, severity, message);
  }

  listRecent(limit = 100) {
    const logs = db.findAll('logs');
    return [...logs]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);
  }
}

module.exports = {
  inboxRepo: new InboxRepository(),
  outboxRepo: new OutboxRepository(),
  sentEmailRepo: new SentEmailRepository(),
  credentialsRepo: new CredentialsRepository(),
  preferencesRepo: new PreferencesRepository(),
  auditLogRepo: new AuditLogRepository()
};
