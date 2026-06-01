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

  findById(id) {
    return db.findById('emails', id);
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
      d => (d.status === 'Approved' || d.status === 'Retrying') && d.retryCount < 5
    );
  }
}

module.exports = {
  inboxRepo: new InboxRepository(),
  outboxRepo: new OutboxRepository()
};
