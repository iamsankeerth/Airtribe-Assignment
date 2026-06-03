const { google } = require('googleapis');
const gmailQuota = require('../modules/gmailQuota');
const {
  credentialsRepo,
  auditLogRepo,
  inboxRepo,
  outboxRepo
} = require('../database/repositories');

class GmailService {
  getRedirectUri() {
    if (process.env.GMAIL_REDIRECT_URI) {
      return process.env.GMAIL_REDIRECT_URI;
    }

    const port = process.env.PORT || 5000;
    return `http://localhost:${port}/api/auth/callback`;
  }

  getOAuth2Client() {
    const creds = credentialsRepo.getDecrypted();
    if (!creds.clientId || !creds.clientSecret) {
      throw new Error('Google OAuth2 Client ID or Client Secret is not configured in settings.');
    }

    return new google.auth.OAuth2(
      creds.clientId,
      creds.clientSecret,
      this.getRedirectUri()
    );
  }

  getAuthUrl() {
    const oauth2Client = this.getOAuth2Client();
    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/userinfo.email'
      ]
    });
  }

  async handleCallback(code) {
    const oauth2Client = this.getOAuth2Client();
    await auditLogRepo.log('Gmail', 'Info', 'Exchanging OAuth2 code for tokens...');

    const { tokens } = await gmailQuota.run('auth', 'exchange OAuth2 code for tokens', () => oauth2Client.getToken(code));
    oauth2Client.setCredentials(tokens);

    // Fetch user profile email
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await gmailQuota.run('auth', 'fetch Gmail user profile', () => oauth2.userinfo.get());
    
    const creds = credentialsRepo.get();
    creds.accessToken = tokens.access_token;
    if (tokens.refresh_token) {
      creds.refreshToken = tokens.refresh_token;
    }
    creds.tokenExpiry = tokens.expiry_date || (Date.now() + 3600000);
    creds.isConnected = true;
    creds.userEmail = userInfo.data.email || 'connected.user@gmail.com';

    // Clear cached email state so the dashboard reflects the connected account
    inboxRepo.clearAll();
    outboxRepo.clearAll();

    await credentialsRepo.save(creds);
    await auditLogRepo.log('Gmail', 'Info', `Successfully connected Gmail account (${creds.userEmail}). Cleared cached emails and drafts.`);
    return creds;
  }

  async getAuthenticatedClient() {
    const oauth2Client = this.getOAuth2Client();
    const creds = credentialsRepo.getDecrypted();

    if (!creds.accessToken) {
      throw new Error('Gmail account is not authenticated.');
    }

    oauth2Client.setCredentials({
      access_token: creds.accessToken,
      refresh_token: creds.refreshToken,
      expiry_date: creds.tokenExpiry
    });

    // Check if token is expired or expiring in 5 mins, if so refresh it
    if (Date.now() > (creds.tokenExpiry - 300000) && creds.refreshToken) {
      try {
        await auditLogRepo.log('Gmail', 'Info', 'OAuth2 access token is expiring. Triggering auto-refresh...');
        const { credentials } = await gmailQuota.run('auth', 'refresh OAuth2 access token', () => oauth2Client.refreshAccessToken());
        
        const currentCreds = credentialsRepo.get();
        currentCreds.accessToken = credentials.access_token;
        currentCreds.tokenExpiry = credentials.expiry_date;
        if (credentials.refresh_token) {
          currentCreds.refreshToken = credentials.refresh_token;
        }
        await credentialsRepo.save(currentCreds);
        
        oauth2Client.setCredentials(credentials);
        await auditLogRepo.log('Gmail', 'Info', 'OAuth2 access token successfully refreshed.');
      } catch (err) {
        await auditLogRepo.log('Gmail', 'Error', 'Failed to refresh OAuth2 token automatically: ' + err.message);
        throw err;
      }
    }

    return oauth2Client;
  }

  // Helper to recursively find payload parts by MIME type
  findPart(payload, mimeType) {
    if (payload.mimeType === mimeType && payload.body && payload.body.data) {
      return Buffer.from(payload.body.data, 'base64').toString('utf8');
    }
    if (payload.parts) {
      for (const part of payload.parts) {
        const found = this.findPart(part, mimeType);
        if (found) return found;
      }
    }
    return null;
  }

  // Parse Gmail payload bodies (prioritizing rich HTML for gorgeous visual rendering)
  parseBody(payload) {
    // 1. Try to extract rich HTML content first
    const htmlContent = this.findPart(payload, 'text/html');
    if (htmlContent) {
      return htmlContent;
    }
    // 2. Fall back to plain text content
    const plainContent = this.findPart(payload, 'text/plain');
    if (plainContent) {
      return plainContent;
    }
    // 3. Fall back to root payload body if any
    if (payload.body && payload.body.data) {
      return Buffer.from(payload.body.data, 'base64').toString('utf8');
    }
    return '';
  }

  async fetchMailboxFolders(folderConfigs) {
    await auditLogRepo.log('Gmail', 'Info', 'Fetching live Gmail folders for mailbox sync.');
    const authClient = await this.getAuthenticatedClient();
    const gmail = google.gmail({ version: 'v1', auth: authClient });

    const fetchedEmails = [];

    for (const folderConfig of folderConfigs) {
      try {
        const res = await gmailQuota.run('sync', `list messages for folder "${folderConfig.name}"`, () => gmail.users.messages.list({
          userId: 'me',
          q: folderConfig.query,
          maxResults: folderConfig.max
        }));

        const messages = res.data.messages || [];
        await auditLogRepo.log('Gmail', 'Info', `Fetching folder "${folderConfig.name}" - Found ${messages.length} messages.`);

        for (const msg of messages) {
          try {
            const detail = await gmailQuota.run('sync', `fetch detail for message ${msg.id}`, () => gmail.users.messages.get({
              userId: 'me',
              id: msg.id,
              format: 'full'
            }));

            const headers = detail.data.payload.headers;
            const subject = (headers.find(h => h.name.toLowerCase() === 'subject') || {}).value || 'No Subject';
            const sender = (headers.find(h => h.name.toLowerCase() === 'from') || {}).value || 'Unknown Sender';
            const recipient = (headers.find(h => h.name.toLowerCase() === 'to') || {}).value || 'me';
            const dateStr = (headers.find(h => h.name.toLowerCase() === 'date') || {}).value || new Date().toISOString();
            const snippet = detail.data.snippet || '';
            const body = this.parseBody(detail.data.payload) || snippet || '(Empty Body)';

            const parsedEmail = {
              id: msg.id,
              threadId: detail.data.threadId,
              sender,
              recipient,
              subject,
              body,
              snippet,
              timestamp: new Date(dateStr).toISOString(),
              isRead: !detail.data.labelIds.includes('UNREAD'),
              folder: folderConfig.name
            };

            fetchedEmails.push(parsedEmail);
          } catch (err) {
            await auditLogRepo.log('Gmail', 'Error', `Failed to fetch detail for msg ID ${msg.id}: ${err.message}`);
          }
        }
      } catch (err) {
        await auditLogRepo.log('Gmail', 'Error', `Failed to fetch folder "${folderConfig.name}": ${err.message}`);
      }
    }

    return fetchedEmails;
  }

  async fetchSentBodies(maxResults = 10) {
    const authClient = await this.getAuthenticatedClient();
    const gmail = google.gmail({ version: 'v1', auth: authClient });

    await auditLogRepo.log('Gmail', 'Info', `Fetching user's last ${maxResults} sent emails...`);

    const listRes = await gmailQuota.run('analysis', 'list sent mail corpus', () => gmail.users.messages.list({
      userId: 'me',
      q: 'from:me',
      maxResults
    }));

    const messages = listRes.data.messages || [];
    if (messages.length === 0) {
      throw new Error('No sent emails found in Gmail outbox to analyze.');
    }

    const bodies = [];
    for (const msg of messages) {
      try {
        const detail = await gmailQuota.run('analysis', `fetch sent message ${msg.id}`, () => gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
          format: 'full'
        }));
        const body = this.parseBody(detail.data.payload);
        if (body && body.trim().length > 10) {
          const rawBody = body.split('\nOn ')[0].split('-----Original Message-----')[0].trim();
          bodies.push(rawBody);
        }
      } catch (err) {
        await auditLogRepo.log('Gmail', 'Warning', `Skipping sent message ${msg.id}: ${err.message}`);
      }
    }

    if (!bodies.length) {
      throw new Error('Could not extract valid text bodies from sent emails.');
    }

    return bodies;
  }

  // Construct RFC 2822 raw message and base64url encode it
  makeRawEmail(to, from, subject, body, threadId, originalMessageId) {
    const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
    const parts = [
      `To: ${to}`,
      `From: ${from}`,
      `Subject: ${utf8Subject}`,
      'Content-Type: text/plain; charset=utf-8',
      'MIME-Version: 1.0',
    ];

    if (threadId) {
      parts.push(`Thread-Topic: ${subject}`);
      // In-Reply-To and References keep Gmail threading working!
      if (originalMessageId) {
        parts.push(`In-Reply-To: ${originalMessageId}`);
        parts.push(`References: ${originalMessageId}`);
      }
    }

    parts.push('', body);
    const mail = parts.join('\r\n');
    
    // Base64URL encode as required by Gmail API
    return Buffer.from(mail)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  async sendReply(draftContent, threadId, originalSubject, senderEmail, originalMessageId = '') {
    await auditLogRepo.log('Gmail', 'Info', `Preparing live SMTP transmission for thread: ${threadId}`);
    
    const authClient = await this.getAuthenticatedClient();
    const gmail = google.gmail({ version: 'v1', auth: authClient });
    const creds = credentialsRepo.get();

    const replySubject = originalSubject.toLowerCase().startsWith('re:') ? originalSubject : `Re: ${originalSubject}`;
    
    // If originalMessageId is not provided, fetch the last message of the thread to get its Message-ID
    let messageId = originalMessageId;
    if (!messageId && threadId) {
      try {
        const threadDetail = await gmailQuota.run('send', `fetch thread ${threadId} for reply headers`, () => gmail.users.threads.get({
          userId: 'me',
          id: threadId
        }));
        const threadMsgs = threadDetail.data.messages || [];
        if (threadMsgs.length > 0) {
          const lastMsg = threadMsgs[threadMsgs.length - 1];
          const lastMsgHeaders = lastMsg.payload.headers;
          const msgIdHeader = lastMsgHeaders.find(h => h.name.toLowerCase() === 'message-id');
          if (msgIdHeader) {
            messageId = msgIdHeader.value;
          }
        }
      } catch (err) {
        await auditLogRepo.log('Gmail', 'Warning', `Could not fetch original Message-ID for threading headers: ${err.message}`);
      }
    }

    const raw = this.makeRawEmail(
      senderEmail, // Reply TO the original sender
      creds.userEmail, // Sent FROM the logged-in user
      replySubject,
      draftContent,
      threadId,
      messageId
    );

    await auditLogRepo.log('Gmail', 'Info', `Transmitting raw message to ${senderEmail}...`);

    const res = await gmailQuota.run('send', `send reply to ${senderEmail}`, () => gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw,
        threadId // Attaches the message to the same thread in UI
      }
    }));

    await auditLogRepo.log('Gmail', 'Info', `Live message sent successfully. Response Message ID: ${res.data.id}`);

    return {
      messageId: res.data.id,
      threadId: res.data.threadId,
      replySubject,
      status: 'success'
    };
  }

  async revokeToken() {
    const creds = credentialsRepo.getDecrypted();
    if (creds.accessToken) {
      try {
        const oauth2Client = this.getOAuth2Client();
        await gmailQuota.run('auth', 'revoke OAuth2 token', () => oauth2Client.revokeToken(creds.accessToken));
        await auditLogRepo.log('Gmail', 'Info', 'Revoked Google OAuth2 credentials.');
      } catch (err) {
        await auditLogRepo.log('Gmail', 'Warning', `OAuth token revocation reported: ${err.message}. Clearing anyway.`);
      }
    }

    await credentialsRepo.clearSession();
  }
}

module.exports = new GmailService();
