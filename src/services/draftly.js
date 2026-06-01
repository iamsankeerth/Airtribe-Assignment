const db = require('../database/db');
const { inboxRepo, outboxRepo } = require('../database/repositories');
const gmailService = require('./gmail');
const aiService = require('./ai');
const styleLearner = require('./styleLearner');
const queue = require('./queue');

function extractEmailAddress(sender = '') {
  const match = sender.match(/<([^>]+)>/);
  return (match ? match[1] : sender).trim().toLowerCase();
}

function isNoReplySender(sender = '') {
  const emailAddress = extractEmailAddress(sender);
  return /\b(no[\s._-]?reply|do[\s._-]?not[\s._-]?reply|donotreply)\b/i.test(emailAddress);
}

class InboxManager {
  async list(folder) {
    return inboxRepo.list(folder);
  }

  async sync() {
    const synced = await gmailService.syncEmails();
    const preferences = db.get('preferences');

    // Automatically pre-generate drafts in the background for synced emails
    for (const email of synced) {
      if (!isNoReplySender(email.sender)) {
        this.getDraftForEmail(email.id).catch(err => {
          console.error(`Background draft pre-generation failed for email ${email.id}:`, err);
        });
      }
    }

    return synced;
  }

  async getDraftForEmail(emailId) {
    const email = inboxRepo.findById(emailId);
    if (!email) {
      throw new Error('Email not found.');
    }

    if (isNoReplySender(email.sender)) {
      throw new Error('This is a no-reply email ID. You will not get a reply from this email.');
    }

    let draft = outboxRepo.findByEmailId(emailId);
    if (!draft) {
      const preferences = db.get('preferences');
      const content = await aiService.generateDraft(email, preferences.defaultTone);
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

  async regenerateDraft(emailId, tone) {
    const email = inboxRepo.findById(emailId);
    if (!email) {
      throw new Error('Email not found.');
    }

    if (isNoReplySender(email.sender)) {
      throw new Error('This is a no-reply email ID. You will not get a reply from this email.');
    }

    const content = await aiService.generateDraft(email, tone);
    let draft = outboxRepo.findByEmailId(emailId);

    if (draft) {
      draft = await outboxRepo.update(draft.id, {
        content,
        tone,
        status: 'Suggested',
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

  async updateDraft(id, content) {
    const draft = outboxRepo.findById(id);
    if (!draft) {
      throw new Error('Draft not found.');
    }

    const updated = await outboxRepo.update(id, {
      content,
      status: 'Edited'
    });

    await db.log('System', 'Info', `Draft ${id} manually modified by user.`);
    return updated;
  }

  async approveDraft(id) {
    const draft = outboxRepo.findById(id);
    if (!draft) {
      throw new Error('Draft not found.');
    }

    await db.log('System', 'Info', `User approved Draft ${id}. Enqueueing message...`);

    const updated = await outboxRepo.update(id, {
      status: 'Approved',
      errorLog: ''
    });

    // Process dispatch queue immediately (non-blocking background task)
    queue.processQueue();

    return updated;
  }

  async rejectDraft(id) {
    const draft = outboxRepo.findById(id);
    if (!draft) {
      throw new Error('Draft not found.');
    }

    await db.log('System', 'Info', `User rejected Draft ${id}. Archiving draft.`);

    const updated = await outboxRepo.update(id, {
      status: 'Rejected'
    });

    return updated;
  }

  async listDrafts() {
    return outboxRepo.list();
  }
}

class ConnectivityManager {
  getAuthUrl() {
    return gmailService.getAuthUrl();
  }

  async handleCallback(code) {
    return gmailService.handleCallback(code);
  }

  async disconnect() {
    return gmailService.revokeToken();
  }

  getStatus() {
    const creds = db.get('credentials');
    return {
      clientId: creds.clientId ? `...${creds.clientId.slice(-6)}` : '',
      clientSecret: creds.clientSecret ? '********' : '',
      geminiApiKey: creds.geminiApiKey ? '********' : '',
      openaiApiKey: creds.openaiApiKey ? '********' : '',
      anthropicApiKey: creds.anthropicApiKey ? '********' : '',
      aiProvider: creds.aiProvider || 'gemini',
      isConnected: creds.isConnected,
      userEmail: creds.userEmail
    };
  }

  async saveConfig(updates) {
    const { clientId, clientSecret, geminiApiKey, openaiApiKey, anthropicApiKey, aiProvider } = updates;
    const creds = db.get('credentials');

    await db.log('System', 'Info', 'Updating system configuration.');

    if (clientId !== undefined && !clientId.startsWith('...')) {
      creds.clientId = clientId;
    }
    if (clientSecret !== undefined && clientSecret !== '********') {
      creds.clientSecret = clientSecret;
    }
    if (geminiApiKey !== undefined && geminiApiKey !== '********') {
      creds.geminiApiKey = geminiApiKey;
    }
    if (openaiApiKey !== undefined && openaiApiKey !== '********') {
      creds.openaiApiKey = openaiApiKey;
    }
    if (anthropicApiKey !== undefined && anthropicApiKey !== '********') {
      creds.anthropicApiKey = anthropicApiKey;
    }
    if (aiProvider !== undefined) {
      creds.aiProvider = aiProvider;
    }

    await db.saveEncryptedCredentials(creds);
    return this.getStatus();
  }
}

class ProfileManager {
  async learnStyle() {
    return styleLearner.learnFromSentEmails();
  }

  getStyleProfile() {
    const preferences = db.get('preferences');
    return preferences.styleProfile;
  }

  getPreferences() {
    return db.get('preferences');
  }

  async savePreferences(updates) {
    const { defaultTone, signature, customInstructions } = updates;
    const preferences = db.get('preferences');

    if (defaultTone) preferences.defaultTone = defaultTone;
    if (signature !== undefined) preferences.signature = signature;
    if (customInstructions !== undefined) preferences.customInstructions = customInstructions;

    db.set('preferences', preferences);
    return preferences;
  }
}

class DraftlyServiceSeam {
  constructor() {
    this.inbox = new InboxManager();
    this.connectivity = new ConnectivityManager();
    this.profile = new ProfileManager();
  }
}

module.exports = new DraftlyServiceSeam();
