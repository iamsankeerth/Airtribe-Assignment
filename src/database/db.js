const fs = require('fs');
const path = require('path');
const cryptoUtils = require('../utils/crypto');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'db.json');

// Default initial state for a pristine installation
const DEFAULTS = {
  preferences: {
    defaultTone: 'Concise',
    signature: 'Sent via Draftly AI Assistant',
    customInstructions: 'Be professional, helpful, and concise. Avoid jargon. Address the sender by their first name.',
    styleProfile: {
      toneDistribution: { formal: 35, friendly: 45, concise: 20 },
      sentenceLength: 'moderate (avg. 14 words)',
      signatureStyle: 'Standard professional',
      commonPhrases: ['Hope this finds you well', 'Let me know what works', 'Cheers'],
      analysisTimestamp: null,
      summary: 'Learned profile not yet computed. Click "Analyze Sent Emails" in Settings to scan your past writing patterns.'
    }
  },
  credentials: {
    clientId: '',
    clientSecret: '',
    geminiApiKey: '',
    openaiApiKey: '',
    anthropicApiKey: '',
    aiProvider: 'gemini',
    accessToken: '', // encrypted
    refreshToken: '', // encrypted
    tokenExpiry: 0,
    isConnected: false,
    userEmail: 'demo.user@draftly.ai'
  },
  emails: [],
  drafts: [],
  logs: [
    {
      id: 'log-1',
      timestamp: new Date(Date.now() - 3600000 * 25).toISOString(),
      category: 'System',
      severity: 'Info',
      message: 'Draftly application initialized in live Gmail mode.'
    }
  ]
};

class JSONDatabase {
  constructor() {
    this.data = {};
    this.isLoaded = false;
  }

  reconcileLegacyDraftSignatures() {
    const drafts = this.data.drafts;
    if (!Array.isArray(drafts) || drafts.length === 0) return;

    let changed = false;

    for (const draft of drafts) {
      if (typeof draft.content === 'string' && draft.content.includes('Demo User')) {
        draft.content = draft.content.replace(/Demo User/g, 'Sankeerth Masetty');
        changed = true;
      }
    }

    return changed;
  }

  reconcileGoogleOAuthCredentials() {
    const creds = this.data.credentials;
    if (!creds) return;

    const likelyWrongSecret =
      !creds.clientSecret ||
      creds.clientSecret.startsWith('AIza');

    if (!likelyWrongSecret) return;

    const projectRoot = path.join(__dirname, '..', '..');
    const secretFile = fs
      .readdirSync(projectRoot)
      .find(name => /^client_secret_.*\.json$/i.test(name));

    if (!secretFile) return;

    try {
      const secretPath = path.join(projectRoot, secretFile);
      const parsed = JSON.parse(fs.readFileSync(secretPath, 'utf8'));
      const webCreds = parsed.web;

      if (webCreds && webCreds.client_id && webCreds.client_secret) {
        creds.clientId = webCreds.client_id;
        creds.clientSecret = webCreds.client_secret;
      }
    } catch (err) {
      console.error('Failed to reconcile Google OAuth credentials from client secret file:', err.message);
    }
  }

  reconcileLegacyEmailFolders() {
    const emails = this.data.emails;
    if (!Array.isArray(emails) || emails.length === 0) return false;

    const creds = this.data.credentials || {};
    const userEmail = (creds.userEmail || 'sankeerthmvsr@gmail.com').toLowerCase().trim();

    let changed = false;

    for (const email of emails) {
      if (email.folder === undefined) {
        const sender = (email.sender || '').toLowerCase();
        
        // Check if sender is the logged in user
        if (sender.includes(userEmail)) {
          email.folder = 'sent';
        } else {
          email.folder = 'inbox';
        }
        changed = true;
      }
    }

    return changed;
  }

  init() {
    if (this.isLoaded) return;

    const dataDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    if (fs.existsSync(DB_PATH)) {
      try {
        const fileContent = fs.readFileSync(DB_PATH, 'utf8');
        this.data = JSON.parse(fileContent);
        
        // Ensure all top-level keys exist (migrations fallback)
        for (const key in DEFAULTS) {
          if (this.data[key] === undefined) {
            this.data[key] = JSON.parse(JSON.stringify(DEFAULTS[key]));
          }
        }
        this.reconcileGoogleOAuthCredentials();
        this.reconcileLegacyDraftSignatures();
        this.reconcileLegacyEmailFolders();
        if (this.data.credentials && 'mode' in this.data.credentials) {
          delete this.data.credentials.mode;
        }
        this.saveSync();
        this.isLoaded = true;
      } catch (err) {
        console.error('Error reading JSON database, resetting to defaults:', err);
        this.resetToDefaults();
      }
    } else {
      this.resetToDefaults();
    }
  }

  resetToDefaults() {
    this.data = JSON.parse(JSON.stringify(DEFAULTS));
    this.reconcileGoogleOAuthCredentials();
    this.saveSync();
    this.isLoaded = true;
  }

  saveSync() {
    try {
      fs.writeFileSync(DB_PATH, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (err) {
      console.error('Failed to save database synchronously:', err);
    }
  }

  async save() {
    try {
      await fs.promises.writeFile(DB_PATH, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (err) {
      console.error('Failed to save database asynchronously:', err);
    }
  }

  // Getters & Setters
  get(key) {
    this.init();
    return this.data[key];
  }

  set(key, value) {
    this.init();
    this.data[key] = value;
    this.save();
  }

  // Collection utilities
  findAll(collection) {
    this.init();
    return this.data[collection] || [];
  }

  findById(collection, id) {
    this.init();
    const items = this.findAll(collection);
    return items.find(item => item.id === id);
  }

  findOne(collection, query) {
    this.init();
    const items = this.findAll(collection);
    return items.find(item => {
      for (const k in query) {
        if (item[k] !== query[k]) return false;
      }
      return true;
    });
  }

  async insert(collection, item) {
    this.init();
    if (!this.data[collection]) {
      this.data[collection] = [];
    }
    this.data[collection].push(item);
    await this.save();
    return item;
  }

  async updateById(collection, id, updates) {
    this.init();
    const items = this.findAll(collection);
    const index = items.findIndex(item => item.id === id);
    if (index !== -1) {
      items[index] = { ...items[index], ...updates, updatedAt: new Date().toISOString() };
      await this.save();
      return items[index];
    }
    return null;
  }

  async update(collection, query, updates) {
    this.init();
    const items = this.findAll(collection);
    let updatedCount = 0;
    for (let i = 0; i < items.length; i++) {
      let matches = true;
      for (const k in query) {
        if (items[i][k] !== query[k]) {
          matches = false;
          break;
        }
      }
      if (matches) {
        items[i] = { ...items[i], ...updates, updatedAt: new Date().toISOString() };
        updatedCount++;
      }
    }
    if (updatedCount > 0) {
      await this.save();
    }
    return updatedCount;
  }

  async delete(collection, id) {
    this.init();
    if (!this.data[collection]) return false;
    const initialLength = this.data[collection].length;
    this.data[collection] = this.data[collection].filter(item => item.id !== id);
    if (this.data[collection].length !== initialLength) {
      await this.save();
      return true;
    }
    return false;
  }

  // Specific encrypted credentials storage helper
  getDecryptedCredentials() {
    this.init();
    const creds = { ...this.data.credentials };
    if (creds.accessToken) {
      creds.accessToken = cryptoUtils.decrypt(creds.accessToken);
    }
    if (creds.refreshToken) {
      creds.refreshToken = cryptoUtils.decrypt(creds.refreshToken);
    }
    return creds;
  }

  async saveEncryptedCredentials(creds) {
    this.init();
    const secureCreds = { ...creds };
    if (secureCreds.accessToken && !secureCreds.accessToken.includes(':')) {
      secureCreds.accessToken = cryptoUtils.encrypt(secureCreds.accessToken);
    }
    if (secureCreds.refreshToken && !secureCreds.refreshToken.includes(':')) {
      secureCreds.refreshToken = cryptoUtils.encrypt(secureCreds.refreshToken);
    }
    this.data.credentials = secureCreds;
    await this.save();
  }

  // Audit Logger Helper
  async log(category, severity, message) {
    const logEntry = {
      id: 'log-' + Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      category,
      severity,
      message
    };
    await this.insert('logs', logEntry);
    // Keep logs list to max 200 entries to save space
    if (this.data.logs.length > 200) {
      this.data.logs = this.data.logs.slice(-200);
      await this.save();
    }
    console.log(`[${category}] [${severity}] ${message}`);
    return logEntry;
  }
}

module.exports = new JSONDatabase();
