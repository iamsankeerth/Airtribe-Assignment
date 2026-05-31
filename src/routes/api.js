const express = require('express');
const router = express.Router();
const db = require('../database/db');
const gmailService = require('../services/gmail');
const mockGmailService = require('../services/mockGmail');
const aiService = require('../services/ai');
const styleLearner = require('../services/styleLearner');
const queue = require('../services/queue');
const { v4: uuidv4 } = require('uuid');

// UTILITY: Get active services based on config mode
function getActiveServices() {
  const creds = db.get('credentials');
  if (creds.mode === 'Live') {
    return { gmail: gmailService, aiMode: 'Live' };
  }
  return { gmail: mockGmailService, aiMode: 'Sandbox' };
}

// ----------------------------------------------------
// 1. CONFIGURATION & CREDENTIALS ENDPOINTS
// ----------------------------------------------------

router.get('/config', (req, res) => {
  const creds = db.get('credentials');
  // Return safe config (no passwords/raw tokens in plain text)
  res.json({
    mode: creds.mode,
    clientId: creds.clientId ? `...${creds.clientId.slice(-6)}` : '',
    clientSecret: creds.clientSecret ? '********' : '',
    geminiApiKey: creds.geminiApiKey ? '********' : '',
    isConnected: creds.isConnected,
    userEmail: creds.userEmail
  });
});

router.post('/config', async (req, res) => {
  try {
    const { mode, clientId, clientSecret, geminiApiKey } = req.body;
    const creds = db.get('credentials');
    
    // Log configuration changes
    await db.log('System', 'Info', `Updating system configuration. Mode set to: ${mode}`);

    creds.mode = mode || 'Sandbox';
    
    if (clientId !== undefined && !clientId.startsWith('...')) {
      creds.clientId = clientId;
    }
    if (clientSecret !== undefined && clientSecret !== '********') {
      creds.clientSecret = clientSecret;
    }
    if (geminiApiKey !== undefined && geminiApiKey !== '********') {
      creds.geminiApiKey = geminiApiKey;
    }

    // If switching modes, let's reset connection state to require OAuth login and clear/repopulate emails
    if (mode !== db.get('credentials').mode) {
      creds.isConnected = false;
      creds.accessToken = '';
      creds.refreshToken = '';
      creds.tokenExpiry = 0;
      
      if (mode === 'Live') {
        db.set('emails', []);
        db.set('drafts', []);
        await db.log('System', 'Info', 'Switched to Live Mode. Cleared all mock/sandbox emails and drafts.');
      } else if (mode === 'Sandbox') {
        const defaultMockEmails = [
          {
            id: 'msg-2',
            threadId: 'thread-2',
            sender: 'Marcus Chen <marcus.chen@techcorp.io>',
            recipient: 'me <demo.user@draftly.ai>',
            subject: 'Question regarding pricing plan for Enterprise',
            body: 'Hello,\n\nWe are currently evaluating Draftly for our customer support team of 45 agents.\n\nCould you please share your Enterprise pricing sheet? Additionally, we have a few questions:\n1. Do you support custom SLA agreements?\n2. Can we host the LLM within our own private AWS VPC?\n3. Do you support custom security reviews?\n\nLooking forward to hearing from you.\n\nThanks,\nMarcus Chen\nIT Infrastructure Lead, TechCorp',
            snippet: 'We are currently evaluating Draftly for our customer support team of 45 agents...',
            timestamp: new Date().toISOString(),
            isRead: false
          },
          {
            id: 'msg-3',
            threadId: 'thread-3',
            sender: 'David Miller <david.miller@gmail.com>',
            recipient: 'me <demo.user@draftly.ai>',
            subject: 'Catch up over coffee next week?',
            body: "Hey mate!\n\nIt's been ages since we last grabbed a coffee. I'll be in your part of town next Wednesday and Thursday for a conference.\n\nAre you free to grab a quick coffee or lunch? Would love to catch up on what you've been working on lately. Let me know what day and time works best for you!\n\nCheers,\nDavid",
            snippet: "Hey mate! It's been ages since we last grabbed a coffee. I'll be in...",
            timestamp: new Date(Date.now() - 3600000 * 24).toISOString(),
            isRead: false
          },
          {
            id: 'msg-4',
            threadId: 'thread-4',
            sender: 'AWS Alerts <noreply@amazon.com>',
            recipient: 'me <demo.user@draftly.ai>',
            subject: 'WARNING: High Latency Detected on API-Gateway',
            body: 'This is an automated notification from CloudWatch.\n\nMetric: IntegrationLatency\nNamespace: AWS/ApiGateway\nStage: Production\nThreshold: > 5000ms for 3 consecutive periods of 60 seconds.\nTrigger Time: 2026-05-31 11:20:00 UTC\n\nPlease check your active lambda instances and container logs to debug potential container warmups or database lockups.',
            snippet: 'This is an automated notification from CloudWatch. Metric: IntegrationLatency...',
            timestamp: new Date(Date.now() - 3600000 * 48).toISOString(),
            isRead: true
          }
        ];
        db.set('emails', defaultMockEmails);
        db.set('drafts', []);
        await db.log('System', 'Info', 'Switched to Sandbox Mode. Restored default sandbox emails.');
      }
    }

    await db.saveEncryptedCredentials(creds);
    res.json({ success: true, message: 'Settings saved successfully.' });
  } catch (err) {
    await db.log('System', 'Error', 'Failed to save configuration: ' + err.message);
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// 2. OAUTH2 AUTHENTICATION ENDPOINTS
// ----------------------------------------------------

router.get('/auth/url', (req, res) => {
  try {
    const { gmail } = getActiveServices();
    const url = gmail.getAuthUrl();
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/auth/callback', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) {
      return res.status(400).send('Authorization code is missing.');
    }

    const { gmail } = getActiveServices();
    const creds = await gmail.handleCallback(code);

    // After connecting, redirect back to dashboard
    res.redirect('/');
  } catch (err) {
    await db.log('System', 'Error', 'OAuth2 callback authentication failed: ' + err.message);
    res.status(500).send(`Authentication failed: ${err.message}`);
  }
});

router.post('/auth/logout', async (req, res) => {
  try {
    const { gmail } = getActiveServices();
    await gmail.revokeToken();
    res.json({ success: true, message: 'Successfully logged out.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// 3. EMAILS & DRAFTS MANAGEMENT ENDPOINTS
// ----------------------------------------------------

// Fetch all fetched inbox emails
router.get('/emails', (req, res) => {
  const emails = db.findAll('emails');
  // Sort by timestamp descending (newest first)
  const sorted = [...emails].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  res.json(sorted);
});

// Trigger synchronization of inbox
router.post('/emails/sync', async (req, res) => {
  try {
    const { gmail } = getActiveServices();
    const synced = await gmail.syncEmails();
    
    // Automatically pre-generate drafts in the background for any *unread* email that does not have a draft!
    const drafts = db.findAll('drafts');
    const preferences = db.get('preferences');
    
    for (const email of synced) {
      const hasDraft = drafts.some(d => d.emailId === email.id);
      if (!hasDraft && !email.isRead) {
        // Run draft generation asynchronously (non-blocking)
        aiService.generateDraft(email, preferences.defaultTone).then(async (content) => {
          await db.insert('drafts', {
            id: 'draft-' + uuidv4().substring(0, 8),
            emailId: email.id,
            threadId: email.threadId,
            content,
            tone: preferences.defaultTone,
            status: 'Suggested',
            retryCount: 0,
            errorLog: '',
            createdAt: new Date().toISOString()
          });
        }).catch(err => {
          console.error(`Pre-generation failed for email ${email.id}:`, err);
        });
      }
    }

    res.json({ success: true, count: synced.length });
  } catch (err) {
    await db.log('Gmail', 'Error', 'Failed to synchronize inbox: ' + err.message);
    res.status(500).json({ error: err.message });
  }
});

// Fetch all drafts
router.get('/drafts', (req, res) => {
  const drafts = db.findAll('drafts');
  res.json(drafts);
});

// Fetch or generate a draft for a specific email
router.get('/drafts/:emailId', async (req, res) => {
  try {
    const { emailId } = req.params;
    const email = db.findById('emails', emailId);
    
    if (!email) {
      return res.status(404).json({ error: 'Email not found.' });
    }

    let draft = db.findOne('drafts', { emailId });
    
    if (!draft) {
      const preferences = db.get('preferences');
      const content = await aiService.generateDraft(email, preferences.defaultTone);
      
      draft = {
        id: 'draft-' + uuidv4().substring(0, 8),
        emailId,
        threadId: email.threadId,
        content,
        tone: preferences.defaultTone,
        status: 'Suggested',
        retryCount: 0,
        errorLog: '',
        createdAt: new Date().toISOString()
      };
      
      await db.insert('drafts', draft);
    }

    res.json(draft);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Regenerate a draft with a different tone/instructions
router.post('/drafts/:emailId/regenerate', async (req, res) => {
  try {
    const { emailId } = req.params;
    const { tone } = req.body;
    const email = db.findById('emails', emailId);

    if (!email) {
      return res.status(404).json({ error: 'Email not found.' });
    }

    const content = await aiService.generateDraft(email, tone);
    
    let draft = db.findOne('drafts', { emailId });
    if (draft) {
      draft = await db.updateById('drafts', draft.id, {
        content,
        tone,
        status: 'Suggested', // Reset status if edited/rejected before
        errorLog: ''
      });
    } else {
      draft = {
        id: 'draft-' + uuidv4().substring(0, 8),
        emailId,
        threadId: email.threadId,
        content,
        tone,
        status: 'Suggested',
        retryCount: 0,
        errorLog: '',
        createdAt: new Date().toISOString()
      };
      await db.insert('drafts', draft);
    }

    res.json(draft);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save manual draft edits
router.put('/drafts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    
    const draft = db.findById('drafts', id);
    if (!draft) {
      return res.status(404).json({ error: 'Draft not found.' });
    }

    const updated = await db.updateById('drafts', id, {
      content,
      status: 'Edited' // Update state to reflect manual tuning
    });

    await db.log('System', 'Info', `Draft ${id} manually modified by user.`);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Approve a draft (puts in queue for sending)
router.post('/drafts/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const draft = db.findById('drafts', id);

    if (!draft) {
      return res.status(404).json({ error: 'Draft not found.' });
    }

    await db.log('System', 'Info', `User approved Draft ${id}. Enqueueing message...`);
    
    // Update status to Approved
    const updated = await db.updateById('drafts', id, {
      status: 'Approved',
      errorLog: ''
    });

    // Run processing cycle immediately (non-blocking background task)
    queue.processQueue();

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reject a draft (archive/dismiss it)
router.post('/drafts/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const draft = db.findById('drafts', id);

    if (!draft) {
      return res.status(404).json({ error: 'Draft not found.' });
    }

    await db.log('System', 'Info', `User rejected Draft ${id}. Archiving draft.`);
    
    const updated = await db.updateById('drafts', id, {
      status: 'Rejected'
    });

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// 4. STYLE LEARNING & ANALYSIS ENDPOINTS
// ----------------------------------------------------

router.get('/style/profile', (req, res) => {
  const preferences = db.get('preferences');
  res.json(preferences.styleProfile);
});

router.post('/style/learn', async (req, res) => {
  try {
    const profile = await styleLearner.learnFromLiveSentEmails();
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save general preferences
router.post('/preferences', (req, res) => {
  try {
    const { defaultTone, signature, customInstructions } = req.body;
    const preferences = db.get('preferences');
    
    if (defaultTone) preferences.defaultTone = defaultTone;
    if (signature !== undefined) preferences.signature = signature;
    if (customInstructions !== undefined) preferences.customInstructions = customInstructions;

    db.set('preferences', preferences);
    res.json({ success: true, preferences });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// 5. AUDIT LOGS ENDPOINT
// ----------------------------------------------------

router.get('/logs', (req, res) => {
  const logs = db.findAll('logs');
  // Sort descending to show newest first in the feed
  const sortedLogs = [...logs].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  res.json(sortedLogs.slice(0, 100)); // limit to 100
});

module.exports = router;
