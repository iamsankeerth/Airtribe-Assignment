const { google } = require('googleapis');
const db = require('../database/db');

class GmailService {
  getOAuth2Client() {
    const creds = db.getDecryptedCredentials();
    if (!creds.clientId || !creds.clientSecret) {
      throw new Error('Google OAuth2 Client ID or Client Secret is not configured in settings.');
    }
    
    // Redirect URI points to our server's OAuth2 callback handler
    const redirectUri = 'http://localhost:5000/api/auth/callback';
    
    return new google.auth.OAuth2(
      creds.clientId,
      creds.clientSecret,
      redirectUri
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
    await db.log('Gmail', 'Info', 'Exchanging OAuth2 code for tokens...');
    
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Fetch user profile email
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    
    const creds = db.get('credentials');
    creds.accessToken = tokens.access_token;
    if (tokens.refresh_token) {
      creds.refreshToken = tokens.refresh_token;
    }
    creds.tokenExpiry = tokens.expiry_date || (Date.now() + 3600000);
    creds.isConnected = true;
    creds.userEmail = userInfo.data.email || 'connected.user@gmail.com';

    await db.saveEncryptedCredentials(creds);
    await db.log('Gmail', 'Info', `Successfully connected Live Gmail account (${creds.userEmail})`);
    return creds;
  }

  async getAuthenticatedClient() {
    const oauth2Client = this.getOAuth2Client();
    const creds = db.getDecryptedCredentials();

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
        await db.log('Gmail', 'Info', 'OAuth2 access token is expiring. Triggering auto-refresh...');
        const { credentials } = await oauth2Client.refreshAccessToken();
        
        const currentCreds = db.get('credentials');
        currentCreds.accessToken = credentials.access_token;
        currentCreds.tokenExpiry = credentials.expiry_date;
        if (credentials.refresh_token) {
          currentCreds.refreshToken = credentials.refresh_token;
        }
        await db.saveEncryptedCredentials(currentCreds);
        
        oauth2Client.setCredentials(credentials);
        await db.log('Gmail', 'Info', 'OAuth2 access token successfully refreshed.');
      } catch (err) {
        await db.log('Gmail', 'Error', 'Failed to refresh OAuth2 token automatically: ' + err.message);
        throw err;
      }
    }

    return oauth2Client;
  }

  // Parse Gmail payload bodies
  parseBody(payload) {
    let body = '';
    if (payload.body && payload.body.data) {
      body = Buffer.from(payload.body.data, 'base64').toString('utf8');
    } else if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain' && part.body && part.body.data) {
          body += Buffer.from(part.body.data, 'base64').toString('utf8');
        } else if (part.mimeType === 'text/html' && part.body && part.body.data && !body) {
          // Fallback to HTML if plain text not parsed yet
          const html = Buffer.from(part.body.data, 'base64').toString('utf8');
          // Simple tag stripper for display
          body = html.replace(/<[^>]*>/g, ' ');
        } else if (part.parts) {
          body += this.parseBody(part);
        }
      }
    }
    return body;
  }

  async syncEmails() {
    await db.log('Gmail', 'Info', 'Syncing live Gmail inbox...');
    const authClient = await this.getAuthenticatedClient();
    const gmail = google.gmail({ version: 'v1', auth: authClient });

    // Fetch up to 10 recent unread/recent messages
    const res = await gmail.users.messages.list({
      userId: 'me',
      q: 'is:inbox',
      maxResults: 10
    });

    const messages = res.data.messages || [];
    await db.log('Gmail', 'Info', `Found ${messages.length} messages in Gmail list.`);

    const syncedEmails = [];

    for (const msg of messages) {
      // Check if we already have this email parsed and stored
      const existing = db.findById('emails', msg.id);
      if (existing) {
        syncedEmails.push(existing);
        continue;
      }

      try {
        const detail = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
          format: 'full'
        });

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
          isRead: !detail.data.labelIds.includes('UNREAD')
        };

        await db.insert('emails', parsedEmail);
        await db.log('Gmail', 'Info', `Successfully synced new email: "${subject}" from ${sender}`);
        syncedEmails.push(parsedEmail);
      } catch (err) {
        await db.log('Gmail', 'Error', `Failed to fetch detail for msg ID ${msg.id}: ${err.message}`);
      }
    }

    return db.findAll('emails');
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

  async sendReply(draftId, draftContent, threadId, originalSubject, senderEmail, originalMessageId = '') {
    await db.log('Gmail', 'Info', `Preparing live SMTP transmission for thread: ${threadId}`);
    
    const authClient = await this.getAuthenticatedClient();
    const gmail = google.gmail({ version: 'v1', auth: authClient });
    const creds = db.get('credentials');

    const replySubject = originalSubject.toLowerCase().startsWith('re:') ? originalSubject : `Re: ${originalSubject}`;
    
    // If originalMessageId is not provided, fetch the last message of the thread to get its Message-ID
    let messageId = originalMessageId;
    if (!messageId && threadId) {
      try {
        const threadDetail = await gmail.users.threads.get({
          userId: 'me',
          id: threadId
        });
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
        await db.log('Gmail', 'Warning', `Could not fetch original Message-ID for threading headers: ${err.message}`);
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

    await db.log('Gmail', 'Info', `Transmitting raw message to ${senderEmail}...`);

    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw,
        threadId // Attaches the message to the same thread in UI
      }
    });

    await db.log('Gmail', 'Info', `Live message sent successfully. Response Message ID: ${res.data.id}`);

    return {
      messageId: res.data.id,
      threadId: res.data.threadId,
      status: 'success'
    };
  }

  async revokeToken() {
    const creds = db.getDecryptedCredentials();
    if (creds.accessToken) {
      try {
        const oauth2Client = this.getOAuth2Client();
        await oauth2Client.revokeToken(creds.accessToken);
        await db.log('Gmail', 'Info', 'Revoked Google OAuth2 credentials.');
      } catch (err) {
        await db.log('Gmail', 'Warning', `OAuth token revocation reported: ${err.message}. Clearing anyway.`);
      }
    }
    
    const currentCreds = db.get('credentials');
    currentCreds.accessToken = '';
    currentCreds.refreshToken = '';
    currentCreds.tokenExpiry = 0;
    currentCreds.isConnected = false;
    await db.saveEncryptedCredentials(currentCreds);
  }
}

module.exports = new GmailService();
