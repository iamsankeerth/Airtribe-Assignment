const db = require('../database/db');
const { v4: uuidv4 } = require('uuid');

const MOCK_SENDERS = [
  'Emma Watson <emma@creativeagencies.com>',
  'Liam Neeson <liam@securelogistics.com>',
  'Sophia Loren <sophia.loren@fashionlab.it>',
  'Oliver Twist <oliver@workhouse.org>',
  'Albert Einstein <albert@physicslabs.edu>'
];

const MOCK_SUBJECTS_AND_BODIES = [
  {
    subject: 'Request for Speaker at DevCon 2026',
    body: `Hello,\n\nI hope you are doing well.\n\nWe are organizing the annual DevCon conference scheduled for October this year. Given your impressive work in AI agent systems, we would be absolutely honored to have you as a keynote speaker.\n\nCould you let us know if you would be open to this, and if so, your speaker fee guidelines?\n\nWarm regards,\nEmma Watson\nEvent Producer`
  },
  {
    subject: 'Delayed shipment query - Order #98322',
    body: `Hi there,\n\nI am reaching out regarding my recent shipment of hardware devices which was scheduled to arrive on Friday. Our team has not received any shipping status updates since Tuesday.\n\nCould you please look into this urgently? Our deployment schedules are fully dependent on these units.\n\nThanks,\nLiam Neeson\nLogistics Coordinator`
  },
  {
    subject: 'Design collaboration proposal',
    body: `Ciao!\n\nI am the lead designer at FashionLab. We are designing a premium smart-apparel line and want to integrate a voice-guided email responder interface.\n\nI saw your Draftly product and wanted to check if you offer white-label APIs or custom integration consulting for luxury brands?\n\nBest,\nSophia`
  },
  {
    subject: 'Bug report: OAuth disconnect loops',
    body: `Hi team,\n\nI am experiencing an issue where my Gmail OAuth connection disconnects every 2 hours. It displays 'Expired Token' and I have to re-authenticate manually each time.\n\nIs there an issue with your refresh token storage? Please check my user logs for account oliver@workhouse.org.\n\nBest,\nOliver`
  },
  {
    subject: 'Discussion on quantum computational limits',
    body: `Dear colleague,\n\nI have been reading your paper on AI-driven text compilation constraints. I believe there is an interesting overlap between your search optimization heuristics and quantum limits of data storage.\n\nWould you be open to a 30-minute Zoom discussion to exchange theories?\n\nSincerely,\nAlbert`
  }
];

class MockGmailService {
  constructor() {
    this.tokenExpirySimulationTime = 0;
  }

  // Simulate generating the consent URL
  getAuthUrl() {
    return 'http://localhost:5000/api/auth/callback?code=mock_authorization_code_xyz123';
  }

  // Simulate exchange code for tokens
  async handleCallback(code) {
    await db.log('Gmail', 'Info', `Simulating OAuth2 callback code exchange for code: ${code}`);
    
    const mockAccessToken = 'mock_access_token_' + Math.random().toString(36).substr(2, 10);
    const mockRefreshToken = 'mock_refresh_token_' + Math.random().toString(36).substr(2, 10);
    const expiryTime = Date.now() + 3600000; // 1 hour validity

    const creds = db.get('credentials');
    creds.accessToken = mockAccessToken;
    creds.refreshToken = mockRefreshToken;
    creds.tokenExpiry = expiryTime;
    creds.isConnected = true;
    creds.userEmail = 'demo.user@draftly.ai';
    
    await db.saveEncryptedCredentials(creds);
    await db.log('Gmail', 'Info', 'Successfully connected mock Gmail account (demo.user@draftly.ai)');
    return creds;
  }

  // Simulate syncing/fetching emails (disabled to prevent mock data leaks)
  async syncEmails() {
    await db.log('Gmail', 'Info', 'Starting sandbox email synchronization...');
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    await db.log('Gmail', 'Info', 'Sandbox sync complete. No messages found (Mock email generation is disabled).');
    return [];
  }

  // Simulate sending a reply email
  async sendReply(draftId, draftContent, threadId, originalSubject, senderEmail) {
    await db.log('Gmail', 'Info', `Initiating send protocol for Draft ID: ${draftId} on Thread: ${threadId}`);
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 1200));

    // Retrieve credentials to check if simulate token expiry
    const creds = db.get('credentials');
    
    // Special test: If Gemini or client API key has "force_error", trigger send failure
    if (creds.clientSecret === 'force_error' || creds.accessToken === 'expired') {
      await db.log('Gmail', 'Error', 'SMTP Connection failed: OAuth2 token has expired or is invalid.');
      throw new Error('OAuth2 token expired (simulated)');
    }

    // Check random failure for retry demo (10% chance if not overridden)
    if (Math.random() < 0.1) {
      await db.log('Gmail', 'Warning', 'Transient network timeout occurred during SMTP handshaking. Queueing for retry...');
      throw new Error('Transient network timeout (simulated)');
    }

    await db.log('Gmail', 'Info', `Sending email to ${senderEmail} in reply to "${originalSubject}"...`);
    await db.log('Gmail', 'Info', `Headers injected: References=${threadId}, In-Reply-To=${threadId}, Subject=Re: ${originalSubject}`);
    await db.log('Gmail', 'Info', `SMTP Send Success! Message ID: msg-replied-${uuidv4().substring(0, 8)}`);

    return {
      messageId: `msg-replied-${uuidv4().substring(0, 8)}`,
      threadId: threadId,
      status: 'success'
    };
  }

  // Simulate token revocation
  async revokeToken() {
    await db.log('Gmail', 'Info', 'Revoking sandbox Gmail tokens and logging out...');
    const creds = db.get('credentials');
    creds.accessToken = '';
    creds.refreshToken = '';
    creds.tokenExpiry = 0;
    creds.isConnected = false;
    await db.saveEncryptedCredentials(creds);
    await db.log('Gmail', 'Info', 'Mock tokens revoked successfully.');
  }
}

module.exports = new MockGmailService();
