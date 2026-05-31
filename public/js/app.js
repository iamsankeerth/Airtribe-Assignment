/* ==========================================================================
   DRAFTLY CLIENT APPLICATION (VANILLA JS)
   ========================================================================== */

// 1. STATE CONFIGURATION
const STATE = {
  activeTab: 'inbox',
  emails: [],
  drafts: [],
  selectedEmailId: null,
  activeTone: 'Concise',
  config: {},
  styleProfile: {},
  logs: []
};

// 2. INITIALIZE ON DOM CONTENT LOADED
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

async function initApp() {
  setupNavigation();
  setupEventListeners();
  
  // Load configuration first
  await fetchConfig();
  
  // Load initial data
  await Promise.all([
    fetchEmails(),
    fetchDrafts(),
    fetchStyleProfile(),
    fetchLogs()
  ]);

  // If we have emails, select the first unread one by default
  if (STATE.emails.length > 0) {
    selectEmail(STATE.emails[0].id);
  } else {
    renderEmptyWorkspace();
  }

  // Start polling logs and queue updates every 4 seconds to reflect backend events in real-time
  setInterval(() => {
    silentSyncUpdate();
  }, 4000);
}

// ----------------------------------------------------
// 3. SERVICE API FETCHERS
// ----------------------------------------------------

async function fetchConfig() {
  try {
    const res = await fetch('/api/config');
    STATE.config = await res.json();
    updateConfigUI();
  } catch (err) {
    showToast('Failed to load system configurations', 'error');
  }
}

async function fetchEmails() {
  try {
    const res = await fetch('/api/emails');
    STATE.emails = await res.json();
    renderEmailList();
    updateStatsUI();
  } catch (err) {
    showToast('Failed to fetch inbox emails', 'error');
  }
}

async function fetchDrafts() {
  try {
    const res = await fetch('/api/drafts');
    STATE.drafts = await res.json();
    
    // If we have a currently selected email, update its draft display
    if (STATE.selectedEmailId) {
      renderDraftArea(STATE.selectedEmailId);
    }
    updateStatsUI();
  } catch (err) {
    showToast('Failed to load email drafts', 'error');
  }
}

async function fetchStyleProfile() {
  try {
    const res = await fetch('/api/style/profile');
    STATE.styleProfile = await res.json();
    renderStyleProfileUI();
  } catch (err) {
    showToast('Failed to load style profile', 'error');
  }
}

async function fetchLogs() {
  try {
    const res = await fetch('/api/logs');
    STATE.logs = await res.json();
    renderLogsTable();
  } catch (err) {
    console.error('Error fetching logs:', err);
  }
}

// Synchronizes in the background to update draft statuses, retries, and logs silently
async function silentSyncUpdate() {
  try {
    // Silent logs reload
    const logsRes = await fetch('/api/logs');
    const newLogs = await logsRes.json();
    
    // Check if new log entries appeared to notify the user
    if (newLogs.length > STATE.logs.length) {
      const difference = newLogs.slice(0, newLogs.length - STATE.logs.length);
      // Notify only if severity is Warning or Error, or if it relates to a sent mail
      difference.forEach(log => {
        if (log.severity === 'Error') {
          showToast(log.message, 'error');
        } else if (log.message.includes('dispatched') || log.message.includes('Success')) {
          showToast(log.message, 'success');
        }
      });
      
      STATE.logs = newLogs;
      renderLogsTable();
      
      // Reload stats & drafts silently to refresh delivery indicators
      const [draftsRes, emailsRes] = await Promise.all([
        fetch('/api/drafts'),
        fetch('/api/emails')
      ]);
      STATE.drafts = await draftsRes.json();
      STATE.emails = await emailsRes.json();
      
      renderEmailList();
      updateStatsUI();
      if (STATE.selectedEmailId) {
        renderDraftArea(STATE.selectedEmailId);
      }
    }
  } catch (err) {
    console.error('Silent sync failed:', err);
  }
}

// ----------------------------------------------------
// 4. UI RENDERING & RENDERING UTILITIES
// ----------------------------------------------------

function setupNavigation() {
  const tabs = document.querySelectorAll('.nav-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetView = tab.getAttribute('data-tab');
      
      // Update Active Navigation Button
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // Update Active Content Panel
      const views = document.querySelectorAll('.tab-content');
      views.forEach(v => v.classList.remove('active'));
      document.getElementById(`view-${targetView}`).classList.add('active');
      
      STATE.activeTab = targetView;
      
      // Refresh views on active enter
      if (targetView === 'logs') {
        fetchLogs();
      }
    });
  });
}

function updateConfigUI() {
  const badge = document.getElementById('systemModeBadge');
  const indicator = badge.querySelector('.pulse-indicator');
  const text = badge.querySelector('.badge-text');

  // 1. Setup mode badge in header
  if (STATE.config.mode === 'Live') {
    indicator.className = 'pulse-indicator status-live';
    text.textContent = 'Live Mode';
  } else {
    indicator.className = 'pulse-indicator status-sandbox';
    text.textContent = 'Sandbox Mode';
  }

  // 2. Setup credentials forms in settings tab
  const checkedRadio = document.querySelector(`input[name="systemMode"][value="${STATE.config.mode}"]`);
  if (checkedRadio) checkedRadio.checked = true;

  // Toggle visible credential inputs based on system mode
  const liveFields = document.getElementById('liveSettingsFields');
  const liveHeader = document.getElementById('liveSettingsHeader');
  
  if (STATE.config.mode === 'Live') {
    liveFields.classList.remove('hidden');
    liveHeader.classList.remove('hidden');
  } else {
    liveFields.classList.add('hidden');
    liveHeader.classList.add('hidden');
  }

  // Show Client ID & API Key masks
  if (STATE.config.clientId) document.getElementById('clientId').value = STATE.config.clientId;
  if (STATE.config.clientSecret) document.getElementById('clientSecret').value = STATE.config.clientSecret;
  if (STATE.config.geminiApiKey) document.getElementById('geminiApiKey').value = STATE.config.geminiApiKey;

  // Update Gmail Connect State
  const connGlow = document.getElementById('connectionGlow');
  const connTitle = document.getElementById('connectionStatusTitle');
  const connDesc = document.getElementById('connectionStatusDesc');
  const connBtn = document.getElementById('connectGmailBtn');
  const disconnBtn = document.getElementById('disconnectGmailBtn');
  const alertBanner = document.getElementById('connectionAlert');

  if (STATE.config.isConnected) {
    connGlow.className = 'status-glow-icon connected';
    connGlow.innerHTML = '<i class="fa-solid fa-square-check"></i>';
    connTitle.textContent = 'Gmail Account Connected';
    connDesc.textContent = `Connected as: ${STATE.config.userEmail}`;
    connBtn.classList.add('hidden');
    disconnBtn.classList.remove('hidden');
    alertBanner.classList.add('hidden');
  } else {
    connGlow.className = 'status-glow-icon disconnected';
    connGlow.innerHTML = '<i class="fa-solid fa-plug"></i>';
    connTitle.textContent = 'Disconnected';
    
    if (STATE.config.mode === 'Live') {
      connDesc.textContent = 'Action Required: Connect Google OAuth2 credentials to synch and reply.';
      connBtn.classList.remove('hidden');
      disconnBtn.classList.add('hidden');
      // If Live Mode and not connected, show alerts
      alertBanner.classList.remove('hidden');
    } else {
      connDesc.textContent = 'Sandbox simulated connector. Click connect to mock auth sequence.';
      connBtn.classList.remove('hidden');
      disconnBtn.classList.add('hidden');
      alertBanner.classList.add('hidden');
    }
  }
}

function renderEmailList() {
  const container = document.getElementById('emailListContainer');
  container.innerHTML = '';

  document.getElementById('emailCount').textContent = STATE.emails.length;

  if (STATE.emails.length === 0) {
    container.innerHTML = '<div class="empty-workspace-state"><h3>Inbox Empty</h3><p>Sync your inbox to fetch messages.</p></div>';
    renderEmptyWorkspace();
    return;
  }

  STATE.emails.forEach(email => {
    const isSelected = email.id === STATE.selectedEmailId;
    const isUnread = !email.isRead;
    
    // Format timestamp nicely
    const dateObj = new Date(email.timestamp);
    const dateString = dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + 
                       dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const item = document.createElement('div');
    item.className = `email-item ${isSelected ? 'selected' : ''} ${isUnread ? 'unread' : ''}`;
    item.setAttribute('id', `email-item-${email.id}`);
    
    item.innerHTML = `
      <div class="email-item-header">
        <span class="email-sender">${escapeHTML(email.sender)}</span>
        <span class="email-date">${dateString}</span>
      </div>
      <div class="email-subject">
        ${isUnread ? '<span class="unread-dot"></span>' : ''}
        ${escapeHTML(email.subject)}
      </div>
      <div class="email-snippet">${escapeHTML(email.snippet || '')}</div>
    `;

    item.addEventListener('click', () => {
      selectEmail(email.id);
    });

    container.appendChild(item);
  });
}

function renderEmptyWorkspace() {
  document.getElementById('workspaceEmailDetail').innerHTML = `
    <div class="empty-workspace-state">
      <i class="fa-solid fa-envelope-open-text"></i>
      <h3>No Email Selected</h3>
      <p>Select an email from the inbox list to generate and manage draft replies.</p>
    </div>
  `;
  document.getElementById('workspaceDraftEditor').classList.add('hidden');
}

function selectEmail(emailId) {
  STATE.selectedEmailId = emailId;
  
  // Highlight list item
  const items = document.querySelectorAll('.email-item');
  items.forEach(item => item.classList.remove('selected'));
  
  const activeItem = document.getElementById(`email-item-${emailId}`);
  if (activeItem) activeItem.classList.add('selected');

  const email = STATE.emails.find(e => e.id === emailId);
  if (!email) return;

  // 1. Render original email body
  const dateObj = new Date(email.timestamp);
  const dateString = dateObj.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + 
                     dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const detailContainer = document.getElementById('workspaceEmailDetail');
  detailContainer.innerHTML = `
    <div class="email-full-header">
      <h2 class="email-full-title">${escapeHTML(email.subject)}</h2>
      <div class="email-meta-row">
        <div class="email-meta-from">From: <strong>${escapeHTML(email.sender)}</strong></div>
        <div class="email-meta-date">${dateString}</div>
      </div>
    </div>
    <div class="email-full-body">${escapeHTML(email.body)}</div>
  `;

  // 2. Render Draft Reply Workspace Area
  renderDraftArea(emailId);
}

async function renderDraftArea(emailId) {
  const editorContainer = document.getElementById('workspaceDraftEditor');
  editorContainer.classList.remove('hidden');

  const draftTextarea = document.getElementById('draftTextArea');
  const draftStatusBadge = document.getElementById('draftStatusBadge');
  const draftTimestamp = document.getElementById('draftTimestamp');
  const retryStatusText = document.getElementById('retryStatusText');
  const toneChips = document.querySelectorAll('.tone-chip');

  // Check if draft already exists in our local store
  let draft = STATE.drafts.find(d => d.emailId === emailId);

  if (!draft) {
    // If no draft exists yet, trigger generation with default tone
    draftTextarea.value = '';
    document.querySelector('.draft-editor-container').classList.add('generating');
    
    try {
      const res = await fetch(`/api/drafts/${emailId}`);
      if (!res.ok) {
        throw new Error('Draft not found or generation failed');
      }
      draft = await res.json();
      
      // Fetch newest drafts state
      const draftsRes = await fetch('/api/drafts');
      STATE.drafts = await draftsRes.json();
    } catch (err) {
      showToast('Failed to generate AI draft reply', 'error');
      document.querySelector('.draft-editor-container').classList.remove('generating');
      return;
    } finally {
      document.querySelector('.draft-editor-container').classList.remove('generating');
    }
  }

  // Populate editor field
  draftTextarea.value = draft.content;
  
  // Format Draft status tag
  draftStatusBadge.textContent = draft.status;
  draftStatusBadge.className = `status-indicator-tag status-${draft.status.toLowerCase()}`;

  // Form tone chips selection
  toneChips.forEach(chip => {
    if (chip.getAttribute('data-tone') === draft.tone) {
      chip.classList.add('active');
    } else {
      chip.classList.remove('active');
    }
  });

  // Timestamp
  const draftDate = new Date(draft.updatedAt || draft.createdAt);
  draftTimestamp.textContent = `Suggested ${draftDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;

  // Process sending & retrier indicator in UI
  if (draft.status === 'Retrying') {
    retryStatusText.classList.remove('hidden');
    retryStatusText.innerHTML = `<i class="fa-solid fa-arrows-spin fa-spin"></i> Retry #${draft.retryCount}/5 failed sends...`;
  } else if (draft.status === 'Sending') {
    retryStatusText.classList.remove('hidden');
    retryStatusText.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> SMTP Dispatched, locking thread...`;
  } else {
    retryStatusText.classList.add('hidden');
  }

  // Lock text field inputs if draft has already been dispatched/sent
  if (draft.status === 'Sent' || draft.status === 'Sending') {
    draftTextarea.disabled = true;
    document.getElementById('saveDraftBtn').disabled = true;
    document.getElementById('approveSendBtn').disabled = true;
    document.getElementById('rejectDraftBtn').disabled = true;
    document.getElementById('approveSendBtn').innerHTML = '<i class="fa-solid fa-circle-check"></i> Sent';
  } else {
    draftTextarea.disabled = false;
    document.getElementById('saveDraftBtn').disabled = false;
    document.getElementById('approveSendBtn').disabled = false;
    document.getElementById('rejectDraftBtn').disabled = false;
    document.getElementById('approveSendBtn').innerHTML = '<i class="fa-solid fa-paper-plane"></i> Approve & Send';
  }
}

function renderStyleProfileUI() {
  const container = document.getElementById('styleProfileContainer');
  const summaryText = document.getElementById('profileSummaryText');
  const metricsGrid = document.getElementById('styleMetricsGrid');
  
  if (!STATE.styleProfile || !STATE.styleProfile.summary) {
    summaryText.textContent = 'Writing style profile has not been trained yet. Click below to analyze sent historical outbox messages.';
    metricsGrid.innerHTML = '';
    return;
  }

  // Update Summary Paragraph
  summaryText.textContent = STATE.styleProfile.summary;
  
  // Format stats indicators
  metricsGrid.innerHTML = `
    <!-- Formal Bar -->
    <div class="metric-bar-group">
      <div class="metric-header">
        <span>Formal Styling</span>
        <span class="metric-value">${STATE.styleProfile.toneDistribution.formal}%</span>
      </div>
      <div class="metric-track">
        <div class="metric-fill" style="width: ${STATE.styleProfile.toneDistribution.formal}%"></div>
      </div>
    </div>

    <!-- Friendly Bar -->
    <div class="metric-bar-group">
      <div class="metric-header">
        <span>Friendly & Casual</span>
        <span class="metric-value">${STATE.styleProfile.toneDistribution.friendly}%</span>
      </div>
      <div class="metric-track">
        <div class="metric-fill" style="width: ${STATE.styleProfile.toneDistribution.friendly}%"></div>
      </div>
    </div>

    <!-- Concise Bar -->
    <div class="metric-bar-group">
      <div class="metric-header">
        <span>Brief & Concise</span>
        <span class="metric-value">${STATE.styleProfile.toneDistribution.concise}%</span>
      </div>
      <div class="metric-track">
        <div class="metric-fill" style="width: ${STATE.styleProfile.toneDistribution.concise}%"></div>
      </div>
    </div>

    <!-- Style Metadata Details -->
    <div class="style-metrics" style="margin-top: 0.5rem; font-size: 0.75rem; border-top: 1px solid rgba(255,255,255,0.03); padding-top: 0.5rem; gap: 0.35rem;">
      <div><strong>Sentence length:</strong> <span style="color: var(--text-primary);">${STATE.styleProfile.sentenceLength}</span></div>
      <div><strong>Signature pattern:</strong> <span style="color: var(--text-primary);">${STATE.styleProfile.signatureStyle}</span></div>
      <div style="display: flex; flex-wrap: wrap; gap: 0.25rem; margin-top: 0.35rem;">
        <strong>Common triggers:</strong>
        ${STATE.styleProfile.commonPhrases.map(phrase => `<span style="background: rgba(157,78,221,0.15); border: 1px solid rgba(157,78,221,0.25); color: var(--primary); padding: 0.1rem 0.35rem; border-radius: 4px; font-size: 0.65rem;">"${phrase}"</span>`).join('')}
      </div>
    </div>
  `;
}

function updateStatsUI() {
  const fetchedCount = STATE.emails.length;
  const sentCount = STATE.drafts.filter(d => d.status === 'Sent').length;
  const failedCount = STATE.drafts.filter(d => d.status === 'Failed').length;

  document.getElementById('statProcessed').textContent = fetchedCount;
  document.getElementById('statSent').textContent = sentCount;

  // Calculate Success Rate
  const totalSendAttempts = sentCount + failedCount;
  if (totalSendAttempts === 0) {
    document.getElementById('statSuccess').textContent = '100%';
  } else {
    const rate = Math.round((sentCount / totalSendAttempts) * 100);
    document.getElementById('statSuccess').textContent = `${rate}%`;
  }
}

function renderLogsTable() {
  const tbody = document.getElementById('logsTableBody');
  tbody.innerHTML = '';

  if (STATE.logs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">No activity logged yet.</td></tr>';
    return;
  }

  STATE.logs.forEach(log => {
    const tr = document.createElement('tr');
    
    // Format timestamp nicely
    const dateObj = new Date(log.timestamp);
    const timeStr = dateObj.toLocaleTimeString([], { hour12: false }) + '.' + String(dateObj.getMilliseconds()).padStart(3, '0');

    tr.innerHTML = `
      <td class="logs-timestamp">${timeStr}</td>
      <td class="logs-category">${log.category}</td>
      <td class="logs-severity severity-${log.severity.toLowerCase()}">${log.severity}</td>
      <td class="logs-message">${escapeHTML(log.message)}</td>
    `;

    tbody.appendChild(tr);
  });
}

// ----------------------------------------------------
// 5. BUTTON CLICK HANDLERS & OPERATIONS
// ----------------------------------------------------

function setupEventListeners() {
  // Sync Inbox Button Click
  const syncBtn = document.getElementById('syncInboxBtn');
  syncBtn.addEventListener('click', async () => {
    syncBtn.disabled = true;
    syncBtn.querySelector('i').classList.add('fa-spin');
    syncBtn.querySelector('span').textContent = 'Syncing...';
    
    showToast('Connecting Gmail servers to retrieve new messages...', 'info');

    try {
      const res = await fetch('/api/emails/sync', { method: 'POST' });
      const data = await res.json();
      
      if (data.success) {
        showToast('Inbox sync completed successfully.', 'success');
        await Promise.all([
          fetchEmails(),
          fetchDrafts(),
          fetchLogs()
        ]);
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      showToast(`Sync Failed: ${err.message}`, 'error');
    } finally {
      syncBtn.disabled = false;
      syncBtn.querySelector('i').classList.remove('fa-spin');
      syncBtn.querySelector('span').textContent = 'Sync Inbox';
    }
  });

  // Switch Tone Chip Clicks
  const chips = document.querySelectorAll('.tone-chip');
  chips.forEach(chip => {
    chip.addEventListener('click', async () => {
      const tone = chip.getAttribute('data-tone');
      if (tone === STATE.activeTone) return;

      if (!STATE.selectedEmailId) return;

      chips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      STATE.activeTone = tone;

      // Add loading state overlay
      document.querySelector('.draft-editor-container').classList.add('generating');

      try {
        const res = await fetch(`/api/drafts/${STATE.selectedEmailId}/regenerate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tone })
        });
        
        const updatedDraft = await res.json();
        
        // Reload global drafts
        const draftsRes = await fetch('/api/drafts');
        STATE.drafts = await draftsRes.json();

        document.getElementById('draftTextArea').value = updatedDraft.content;
        
        // Update badges
        const badge = document.getElementById('draftStatusBadge');
        badge.textContent = updatedDraft.status;
        badge.className = `status-indicator-tag status-${updatedDraft.status.toLowerCase()}`;
        
        showToast(`Draft regenerated with ${tone} tone`, 'info');
      } catch (err) {
        showToast('Tone switcher regeneration failed', 'error');
      } finally {
        document.querySelector('.draft-editor-container').classList.remove('generating');
      }
    });
  });

  // Save Edits Draft button
  document.getElementById('saveDraftBtn').addEventListener('click', async () => {
    const draft = STATE.drafts.find(d => d.emailId === STATE.selectedEmailId);
    if (!draft) return;

    const editedContent = document.getElementById('draftTextArea').value;
    
    try {
      const res = await fetch(`/api/drafts/${draft.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editedContent })
      });
      
      const updated = await res.json();
      
      // Update local state
      const draftsRes = await fetch('/api/drafts');
      STATE.drafts = await draftsRes.json();

      // Render Badge
      const badge = document.getElementById('draftStatusBadge');
      badge.textContent = updated.status;
      badge.className = `status-indicator-tag status-${updated.status.toLowerCase()}`;

      showToast('Draft edits saved successfully.', 'success');
      fetchLogs();
    } catch (err) {
      showToast('Failed to save draft edits', 'error');
    }
  });

  // Discard / Reject Draft Button
  document.getElementById('rejectDraftBtn').addEventListener('click', async () => {
    const draft = STATE.drafts.find(d => d.emailId === STATE.selectedEmailId);
    if (!draft) return;

    if (!confirm('Are you sure you want to discard this draft suggestion? This will archive the reply.')) return;

    try {
      const res = await fetch(`/api/drafts/${draft.id}/reject`, { method: 'POST' });
      const updated = await res.json();

      // Reload drafts
      const draftsRes = await fetch('/api/drafts');
      STATE.drafts = await draftsRes.json();

      renderDraftArea(STATE.selectedEmailId);
      showToast('Draft successfully discarded.', 'info');
      fetchLogs();
    } catch (err) {
      showToast('Failed to discard draft', 'error');
    }
  });

  // Approve & Send Draft Button
  document.getElementById('approveSendBtn').addEventListener('click', async () => {
    const draft = STATE.drafts.find(d => d.emailId === STATE.selectedEmailId);
    if (!draft) return;

    // Save manual modifications in text area first before sending
    const currentText = document.getElementById('draftTextArea').value;
    
    try {
      // 1. Save edits
      await fetch(`/api/drafts/${draft.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: currentText })
      });

      // 2. Trigger approve
      showToast('Draft approved! Enqueued in Send Manager for immediate SMTP transmission.', 'success');
      
      const res = await fetch(`/api/drafts/${draft.id}/approve`, { method: 'POST' });
      const updated = await res.json();

      // Lock text field inputs
      document.getElementById('draftTextArea').disabled = true;
      document.getElementById('saveDraftBtn').disabled = true;
      document.getElementById('approveSendBtn').disabled = true;
      document.getElementById('rejectDraftBtn').disabled = true;

      document.getElementById('draftStatusBadge').textContent = 'Approved';
      document.getElementById('draftStatusBadge').className = 'status-indicator-tag status-approved';
      
      // Perform fast reload
      const draftsRes = await fetch('/api/drafts');
      STATE.drafts = await draftsRes.json();
      
      renderDraftArea(STATE.selectedEmailId);
      fetchLogs();
    } catch (err) {
      showToast('Failed to process draft approval', 'error');
    }
  });

  // Training style button click
  const learnBtn = document.getElementById('learnStyleBtn');
  learnBtn.addEventListener('click', async () => {
    learnBtn.disabled = true;
    
    const progressTrack = document.getElementById('learningProgress');
    const fill = document.getElementById('progressFillBar');
    const text = document.getElementById('progressText');

    progressTrack.classList.remove('hidden');
    fill.style.width = '0%';
    text.textContent = 'Mapping outbox threads...';

    // Simulate progress increments for rich visual experience
    let percent = 0;
    const interval = setInterval(() => {
      percent += 15;
      if (percent > 90) {
        clearInterval(interval);
      } else {
        fill.style.width = `${percent}%`;
        if (percent === 30) text.textContent = 'Parsing greetings and signatures...';
        if (percent === 60) text.textContent = 'Forming word frequency vector maps...';
        if (percent === 75) text.textContent = 'Analyzing sentence layouts...';
      }
    }, 300);

    try {
      const res = await fetch('/api/style/learn', { method: 'POST' });
      const data = await res.json();
      
      clearInterval(interval);
      fill.style.width = '100%';
      text.textContent = 'Analysis Compiled!';

      setTimeout(async () => {
        progressTrack.classList.add('hidden');
        showToast('Writing style profile learned successfully!', 'success');
        await fetchStyleProfile();
        await fetchLogs();
        learnBtn.disabled = false;
      }, 800);

    } catch (err) {
      clearInterval(interval);
      progressTrack.classList.add('hidden');
      showToast('Failed to compile writing style profile', 'error');
      learnBtn.disabled = false;
    }
  });

  // Toggle Live/Sandbox inputs inside settings page
  const configForm = document.getElementById('settingsForm');
  configForm.addEventListener('change', () => {
    const selectedMode = document.querySelector('input[name="systemMode"]:checked').value;
    const fields = document.getElementById('liveSettingsFields');
    const header = document.getElementById('liveSettingsHeader');
    
    if (selectedMode === 'Live') {
      fields.classList.remove('hidden');
      header.classList.remove('hidden');
    } else {
      fields.classList.add('hidden');
      header.classList.add('hidden');
    }
  });

  // Save Settings Forms
  configForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const selectedMode = document.querySelector('input[name="systemMode"]:checked').value;
    
    const payload = {
      mode: selectedMode,
      clientId: document.getElementById('clientId').value,
      clientSecret: document.getElementById('clientSecret').value,
      geminiApiKey: document.getElementById('geminiApiKey').value
    };

    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      
      if (data.success) {
        showToast('System configuration saved successfully.', 'success');
        await fetchConfig();
        await fetchEmails();
        await fetchDrafts();
        await fetchLogs();
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      showToast(`Settings save failed: ${err.message}`, 'error');
    }
  });

  // Account Connect button clicks
  document.getElementById('connectGmailBtn').addEventListener('click', async () => {
    if (STATE.config.mode === 'Sandbox') {
      // MOCK POPUP SIMULATOR FOR SANDBOX FLOW
      showToast('Opening Google Account Consent Authorization Dialog...', 'info');
      
      const authUrlRes = await fetch('/api/auth/url');
      const authUrlData = await authUrlRes.json();

      const width = 600, height = 700;
      const left = (window.innerWidth / 2) - (width / 2);
      const top = (window.innerHeight / 2) - (height / 2);
      
      // Simulated window delay
      const win = window.open(authUrlData.url, 'Google OAuth Authorization', `width=${width},height=${height},left=${left},top=${top}`);
      
      const timer = setInterval(async () => {
        if (win.closed) {
          clearInterval(timer);
          await fetchConfig();
          await fetchLogs();
        }
      }, 500);
    } else {
      // LIVE REDIRECT FLOW
      showToast('Redirecting to secure Google Accounts OAuth portal...', 'info');
      try {
        const res = await fetch('/api/auth/url');
        const data = await res.json();
        window.location.href = data.url;
      } catch (err) {
        showToast('Failed to construct Google OAuth2 redirection link', 'error');
      }
    }
  });

  // Account Disconnect/Logout Button
  document.getElementById('disconnectGmailBtn').addEventListener('click', async () => {
    if (!confirm('Are you sure you want to disconnect Draftly from your Google account and revoke OAuth tokens?')) return;
    
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast('Google credentials cleared. Session terminated.', 'info');
        await fetchConfig();
        await fetchLogs();
      }
    } catch (err) {
      showToast('Logout request failed', 'error');
    }
  });

  // Save Writing preferences forms
  const prefForm = document.getElementById('preferencesForm');
  
  // Load initial preferences
  fetch('/api/config')
    .then(() => fetch('/api/emails')) // Chain dummy fetch to ensure DB is initialized
    .then(() => {
      // Quick preferences fetch
      fetch('/api/style/profile')
        .then(() => {
          // Triggering a read of general Preferences
          // We read them by querying system log configs or direct reads
          // To keep it clean, let's load preferences from config get details
          // But actually we can do a quick load of preferences:
          // In db Preferences is stored. Let's load the fields:
          fetch('/api/preferences', { method: 'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({}) })
            .then(res => res.json())
            .then(data => {
              if (data.preferences) {
                document.getElementById('defaultTone').value = data.preferences.defaultTone;
                document.getElementById('customInstructions').value = data.preferences.customInstructions;
                document.getElementById('signature').value = data.preferences.signature;
              }
            });
        });
    });

  prefForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      defaultTone: document.getElementById('defaultTone').value,
      customInstructions: document.getElementById('customInstructions').value,
      signature: document.getElementById('signature').value
    };

    try {
      const res = await fetch('/api/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        showToast('Writing preference templates updated successfully.', 'success');
        await fetchConfig();
        await fetchLogs();
      }
    } catch (err) {
      showToast('Failed to save writing preferences', 'error');
    }
  });

  // Clear Logs Reload button
  document.getElementById('clearLogsBtn').addEventListener('click', () => {
    fetchLogs();
    showToast('Audit trail feeds re-synchronized.', 'success');
  });
}

// ----------------------------------------------------
// 6. HELPER UTILITY FUNCTIONS
// ----------------------------------------------------

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let icon = 'fa-circle-info';
  if (type === 'success') icon = 'fa-circle-check';
  if (type === 'warning') icon = 'fa-triangle-exclamation';
  if (type === 'error') icon = 'fa-circle-xmark';

  toast.innerHTML = `
    <i class="fa-solid ${icon}"></i>
    <span>${message}</span>
  `;

  container.appendChild(toast);

  // Auto remove after 4.5 seconds
  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s ease reverse forwards';
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 4500);
}

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}
