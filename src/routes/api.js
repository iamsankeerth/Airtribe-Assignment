const express = require('express');
const router = express.Router();
const db = require('../database/db'); // For raw logs retrieval
const draftly = require('../services/draftly');

// ----------------------------------------------------
// 1. CONFIGURATION & CREDENTIALS ENDPOINTS
// ----------------------------------------------------

router.get('/config', (req, res) => {
  try {
    const status = draftly.connectivity.getStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/config', async (req, res) => {
  try {
    const status = await draftly.connectivity.saveConfig(req.body);
    res.json({ success: true, message: 'Settings saved successfully.', config: status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// 2. OAUTH2 AUTHENTICATION ENDPOINTS
// ----------------------------------------------------

router.get('/auth/url', (req, res) => {
  try {
    const url = draftly.connectivity.getAuthUrl();
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
    await draftly.connectivity.handleCallback(code);
    res.redirect('/');
  } catch (err) {
    res.status(500).send(`Authentication failed: ${err.message}`);
  }
});

router.post('/auth/logout', async (req, res) => {
  try {
    await draftly.connectivity.disconnect();
    res.json({ success: true, message: 'Successfully logged out.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// 3. EMAILS & DRAFTS MANAGEMENT ENDPOINTS
// ----------------------------------------------------

router.get('/emails', async (req, res) => {
  try {
    const { folder } = req.query;
    const emails = await draftly.inbox.list(folder);
    res.json(emails);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/emails/sync', async (req, res) => {
  try {
    const synced = await draftly.inbox.sync();
    res.json({ success: true, count: synced.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/drafts', async (req, res) => {
  try {
    const drafts = await draftly.inbox.listDrafts();
    res.json(drafts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/drafts/:emailId', async (req, res) => {
  try {
    const { emailId } = req.params;
    const draft = await draftly.inbox.getDraftForEmail(emailId);
    res.json(draft);
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 400).json({ error: err.message });
  }
});

router.post('/drafts/:emailId/regenerate', async (req, res) => {
  try {
    const { emailId } = req.params;
    const { tone } = req.body;
    const draft = await draftly.inbox.regenerateDraft(emailId, tone);
    res.json(draft);
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 400).json({ error: err.message });
  }
});

router.put('/drafts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    const updated = await draftly.inbox.updateDraft(id, content);
    res.json(updated);
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
  }
});

router.post('/drafts/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await draftly.inbox.approveDraft(id);
    res.json(updated);
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
  }
});

router.post('/drafts/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await draftly.inbox.rejectDraft(id);
    res.json(updated);
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// 4. STYLE LEARNING & ANALYSIS ENDPOINTS
// ----------------------------------------------------

router.get('/style/profile', (req, res) => {
  try {
    const profile = draftly.profile.getStyleProfile();
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/style/learn', async (req, res) => {
  try {
    const profile = await draftly.profile.learnStyle();
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/preferences', (req, res) => {
  try {
    const preferences = draftly.profile.getPreferences();
    res.json(preferences);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/preferences', async (req, res) => {
  try {
    const preferences = await draftly.profile.savePreferences(req.body);
    res.json({ success: true, preferences });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// 5. AUDIT LOGS ENDPOINT
// ----------------------------------------------------

router.get('/logs', (req, res) => {
  try {
    const logs = db.findAll('logs');
    const sortedLogs = [...logs].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    res.json(sortedLogs.slice(0, 100)); // limit to 100
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
