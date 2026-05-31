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
    mode: 'Live', // 'Sandbox' or 'Live'
    clientId: '',
    clientSecret: '',
    geminiApiKey: '',
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
      message: 'Draftly Application initialized in Sandbox Mode.'
    }
  ]
};

class JSONDatabase {
  constructor() {
    this.data = {};
    this.isLoaded = false;
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
