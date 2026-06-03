const {
  credentialsRepo,
  auditLogRepo
} = require('../database/repositories');
const gmailService = require('../services/gmail');

const channelConnectivity = {
  getAuthUrl() {
    return gmailService.getAuthUrl();
  },

  async handleCallback(code) {
    return gmailService.handleCallback(code);
  },

  async disconnect() {
    return gmailService.revokeToken();
  },

  getStatus() {
    const creds = credentialsRepo.get();
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
  },

  async saveConfig(updates) {
    const { clientId, clientSecret, geminiApiKey, openaiApiKey, anthropicApiKey, aiProvider } = updates;
    const creds = credentialsRepo.get();

    await auditLogRepo.log('System', 'Info', 'Updating system configuration.');

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

    await credentialsRepo.save(creds);
    return this.getStatus();
  }
};

module.exports = channelConnectivity;
