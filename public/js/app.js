/* ==========================================================================
   DRAFTLY CLIENT APPLICATION (VANILLA JS)
   ========================================================================== */

// 1. STATE CONFIGURATION
const STATE = {
  activeTab: 'inbox',
  currentFolder: 'inbox',
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

  // Trigger a non-blocking background synchronization on page load
  if (STATE.config.isConnected) {
    fetch('/api/emails/sync', { method: 'POST' }).catch(err => {
      console.error('Background startup sync failed:', err);
    });
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
    const folder = STATE.currentFolder || 'inbox';
    const res = await fetch(`/api/emails?folder=${folder}`);
    STATE.emails = await res.json();
    renderEmailList();
    updateStatsUI();
  } catch (err) {
    showToast('Failed to fetch emails', 'error');
  }
}

async function fetchDrafts() {
  try {
    const res = await fetch('/api/drafts');
    STATE.drafts = normalizeDrafts(await res.json());
    
    // If we have a currently selected email, update its draft display
    if (STATE.selectedEmailId) {
      renderDraftArea(STATE.selectedEmailId);
    }
    updateStatsUI();
  } catch (err) {
    showToast('Failed to load email drafts', 'error');
  }
}

async function preloadDraftForEmail(emailId) {
  const email = STATE.emails.find(e => e.id === emailId);
  if (!email || isNoReplySender(email.sender)) return null;

  const existingDraft = STATE.drafts.find(d => d.emailId === emailId);
  if (existingDraft) return existingDraft;

  try {
    const res = await fetch(`/api/drafts/${emailId}`);
    if (!res.ok) return null;

    const draft = normalizeDraft(await res.json());
    const existingIndex = STATE.drafts.findIndex(d => d.emailId === emailId);
    if (existingIndex >= 0) {
      STATE.drafts[existingIndex] = draft;
    } else {
      STATE.drafts.push(draft);
    }
    return draft;
  } catch (err) {
    console.error('Background draft preload failed:', err);
    return null;
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
    
    // Check if new log entries appeared to update the UI
    if (newLogs.length > STATE.logs.length) {
      STATE.logs = newLogs;
      renderLogsTable();
      
      // Reload stats & drafts silently to refresh delivery indicators
      const folder = STATE.currentFolder || 'inbox';
      const [draftsRes, emailsRes] = await Promise.all([
        fetch('/api/drafts'),
        fetch(`/api/emails?folder=${folder}`)
      ]);
      STATE.drafts = normalizeDrafts(await draftsRes.json());
      STATE.emails = await emailsRes.json();
      
      renderEmailList();
      updateStatsUI();
      if (STATE.selectedEmailId) {
        const editorContainer = document.getElementById('workspaceDraftEditor');
        if (editorContainer && !editorContainer.classList.contains('hidden')) {
          renderDraftArea(STATE.selectedEmailId);
        }
      } else if (STATE.emails.length > 0) {
        selectEmail(STATE.emails[0].id);
      }
    }
  } catch (err) {
    console.error('Silent sync failed:', err);
  }
}

function sanitizeDraftContent(content) {
  if (typeof content !== 'string') return content;
  return content.replace(/Demo User/g, 'Sankeerth Masetty');
}

function normalizeDraft(draft) {
  if (!draft || typeof draft !== 'object') return draft;
  return {
    ...draft,
    content: sanitizeDraftContent(draft.content)
  };
}

function normalizeDrafts(drafts) {
  if (!Array.isArray(drafts)) return [];
  return drafts.map(normalizeDraft);
}

function scrollWorkspaceToTop() {
  const appContent = document.querySelector('.app-content');
  const detailSection = document.getElementById('workspaceEmailDetail');
  if (!detailSection) return;

  if (appContent) {
    const targetTop = Math.max(0, detailSection.offsetTop - 16);
    appContent.scrollTo({ top: targetTop, behavior: 'smooth' });
    return;
  }

  detailSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function scrollWorkspaceToDraftEditor() {
  const appContent = document.querySelector('.app-content');
  const editorContainer = document.getElementById('workspaceDraftEditor');
  if (!editorContainer) return;

  if (appContent) {
    const targetTop = Math.max(0, editorContainer.offsetTop - 100);
    appContent.scrollTo({ top: targetTop, behavior: 'smooth' });
    return;
  }

  editorContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  const clientField = document.getElementById('clientId');
  const secretField = document.getElementById('clientSecret');
  const geminiField = document.getElementById('geminiApiKey');
  const openaiField = document.getElementById('openaiApiKey');
  const anthropicField = document.getElementById('anthropicApiKey');
  const providerField = document.getElementById('aiProvider');
  
  if (clientField && STATE.config.clientId) clientField.value = STATE.config.clientId;
  if (secretField && STATE.config.clientSecret) secretField.value = STATE.config.clientSecret;
  
  if (geminiField && STATE.config.geminiApiKey) {
    geminiField.value = STATE.config.geminiApiKey;
  }
  if (openaiField && STATE.config.openaiApiKey) {
    openaiField.value = STATE.config.openaiApiKey;
  }
  if (anthropicField && STATE.config.anthropicApiKey) {
    anthropicField.value = STATE.config.anthropicApiKey;
  }
  if (providerField && STATE.config.aiProvider) {
    providerField.value = STATE.config.aiProvider;
  }

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
    connDesc.textContent = 'Action required: connect Google OAuth to sync and send live email replies.';
    connBtn.classList.remove('hidden');
    disconnBtn.classList.add('hidden');
    alertBanner.classList.remove('hidden');
  }
}

function extractEmailAddress(sender = '') {
  const match = sender.match(/<([^>]+)>/);
  return (match ? match[1] : sender).trim().toLowerCase();
}

function isNoReplySender(sender = '') {
  return /\b(no[\s._-]?reply|do[\s._-]?not[\s._-]?reply|donotreply)\b/i.test(extractEmailAddress(sender));
}

function setToneChipsDisabled(disabled) {
  document.querySelectorAll('.tone-chip').forEach(chip => {
    chip.disabled = disabled;
    chip.classList.toggle('disabled', disabled);
  });
}

function renderNoReplyDraftState(email) {
  const editorContainer = document.getElementById('workspaceDraftEditor');
  editorContainer.classList.remove('hidden');

  const btnContainer = document.getElementById('triggerAiSuggestionBtnContainer');
  if (btnContainer) btnContainer.style.display = 'none';

  document.getElementById('draftTextArea').value =
    `This is a no-reply email ID (${extractEmailAddress(email.sender)}). You will not get a reply from this email ID.`;
  document.getElementById('draftTextArea').disabled = true;
  document.getElementById('draftStatusBadge').textContent = 'No Reply';
  document.getElementById('draftStatusBadge').className = 'status-indicator-tag status-failed';
  document.getElementById('draftTimestamp').textContent = 'Suggestion unavailable';
  document.getElementById('retryStatusText').classList.add('hidden');
  document.getElementById('saveDraftBtn').disabled = true;
  document.getElementById('approveSendBtn').disabled = true;
  document.getElementById('rejectDraftBtn').disabled = true;
  document.getElementById('approveSendBtn').innerHTML = '<i class="fa-solid fa-ban"></i> Cannot Send';
  setToneChipsDisabled(true);
}

function renderEmailList() {
  const container = document.getElementById('emailListContainer');
  container.innerHTML = '';

  document.getElementById('emailCount').textContent = STATE.emails.length;

  if (STATE.emails.length === 0) {
    let folderName = (STATE.currentFolder || 'inbox').toUpperCase();
    if (folderName === 'ALL') folderName = 'ALL MAIL';
    container.innerHTML = `<div class="empty-workspace-state"><h3>${folderName} Empty</h3><p>No messages found. Sync your inbox to fetch new messages.</p></div>`;
    renderEmptyWorkspace();
    return;
  }

  STATE.emails.forEach(email => {
    const isSelected = email.id === STATE.selectedEmailId;
    const isUnread = !email.isRead;
    
    // Format timestamp safely
    let dateString = 'Unknown Date';
    try {
      const dateObj = new Date(email.timestamp);
      if (!isNaN(dateObj.getTime())) {
        dateString = dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + 
                     dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
    } catch (err) {
      console.error('Error formatting date in email list:', err);
    }

    const item = document.createElement('div');
    item.className = `email-item ${isSelected ? 'selected' : ''} ${isUnread ? 'unread' : ''}`;
    item.setAttribute('id', `email-item-${email.id}`);
    
    const emailFolder = email.folder || 'inbox';
    
    item.innerHTML = `
      <div class="email-item-header">
        <span class="email-sender">${escapeHTML(email.sender)}</span>
        <span class="email-date">${dateString}</span>
      </div>
      <div class="email-subject">
        ${isUnread ? '<span class="unread-dot"></span>' : ''}
        ${escapeHTML(email.subject)}
      </div>
      <div class="email-item-footer">
        <span class="email-snippet">${escapeHTML(email.snippet || '')}</span>
        <span class="folder-badge badge-${emailFolder}">${emailFolder}</span>
      </div>
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

  // 1. Render original email body with safe date parsing
  let dateString = 'Unknown Date';
  try {
    const dateObj = new Date(email.timestamp);
    if (!isNaN(dateObj.getTime())) {
      dateString = dateObj.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + 
                   dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
  } catch (err) {
    console.error('Error formatting date in select email:', err);
  }

  // Detect if body contains HTML tags and render beautifully in an iframe
  const isHtml = /<[a-z][\s\S]*>/i.test(email.body);

  const detailContainer = document.getElementById('workspaceEmailDetail');
  detailContainer.innerHTML = `
    <div class="email-full-header">
      <h2 class="email-full-title">${escapeHTML(email.subject)}</h2>
      <div class="email-meta-row">
        <div class="email-meta-from">From: <strong>${escapeHTML(email.sender)}</strong></div>
        <div class="email-meta-actions" id="triggerAiSuggestionBtnContainer">
          <button class="btn btn-accent btn-glow" id="triggerAiSuggestionBtn">
            AI Suggestion
          </button>
          <div class="email-meta-date">${dateString}</div>
        </div>
      </div>
    </div>
    <div id="emailBodyContainer"></div>
  `;

  const bodyContainer = document.getElementById('emailBodyContainer');
  if (isHtml) {
    const iframe = document.createElement('iframe');
    iframe.style.width = '100%';
    iframe.style.border = '1px solid var(--border-color)';
    iframe.style.minHeight = '450px';
    iframe.style.background = 'white';
    iframe.style.borderRadius = '8px';
    iframe.style.boxShadow = 'inset 0 0 5px rgba(0,0,0,0.02)';
    iframe.style.marginTop = '1rem';
    iframe.style.overflow = 'hidden';
    iframe.setAttribute('sandbox', 'allow-same-origin');
    iframe.setAttribute('scrolling', 'no');
    iframe.srcdoc = email.body;
    
    // Automatically stretch iframe height to match its scroll content dynamically
    iframe.addEventListener('load', () => {
      setTimeout(() => {
        try {
          const doc = iframe.contentWindow.document;
          const body = doc.body;
          const html = doc.documentElement;
          const height = Math.max(
            body.scrollHeight,
            body.offsetHeight,
            html.clientHeight,
            html.scrollHeight,
            html.offsetHeight
          );
          iframe.style.height = (height + 25) + 'px';
        } catch (err) {
          console.warn('Could not auto-adjust iframe height:', err);
          iframe.style.height = '800px'; // Generous fallback height
        }
      }, 100);
    });

    bodyContainer.appendChild(iframe);
  } else {
    const div = document.createElement('div');
    div.className = 'email-full-body';
    div.textContent = email.body;
    bodyContainer.appendChild(div);
  }

  // Hide Draft Reply Area by default
  const editorContainer = document.getElementById('workspaceDraftEditor');
  editorContainer.classList.add('hidden');

  scrollWorkspaceToTop();

  // Make sure the triggering button container starts visible
  const btnContainer = document.getElementById('triggerAiSuggestionBtnContainer');
  if (btnContainer) btnContainer.style.display = 'flex';

  // Warm the suggestion in the background so the AI panel opens with a preloaded draft.
  preloadDraftForEmail(emailId);

  // Bind click trigger for AI Suggestion
  document.getElementById('triggerAiSuggestionBtn').addEventListener('click', () => {
    if (isNoReplySender(email.sender)) {
      renderNoReplyDraftState(email);
      showToast('This is a no-reply email ID. You will not get a reply from this email ID.', 'warning');
      return;
    }
    renderDraftArea(emailId);
  });
}

async function renderDraftArea(emailId) {
  const email = STATE.emails.find(e => e.id === emailId);
  if (!email) return;
  if (isNoReplySender(email.sender)) {
    renderNoReplyDraftState(email);
    return;
  }

  const editorContainer = document.getElementById('workspaceDraftEditor');
  editorContainer.classList.remove('hidden');

  scrollWorkspaceToDraftEditor();

  // Hide the triggering AI Suggestion button container in the email detail pane to avoid double suggestion indicators
  const btnContainer = document.getElementById('triggerAiSuggestionBtnContainer');
  if (btnContainer) btnContainer.style.display = 'none';

  const draftTextarea = document.getElementById('draftTextArea');
  const draftStatusBadge = document.getElementById('draftStatusBadge');
  const draftTimestamp = document.getElementById('draftTimestamp');
  const retryStatusText = document.getElementById('retryStatusText');
  const toneChips = document.querySelectorAll('.tone-chip');
  setToneChipsDisabled(false);

  // Check if draft already exists in our local store
  let draft = STATE.drafts.find(d => d.emailId === emailId);

  if (!draft) {
    // If no draft exists yet, trigger generation with default tone
    draftTextarea.value = '';
    document.querySelector('.draft-editor-container').classList.add('generating');
    
    try {
      const res = await fetch(`/api/drafts/${emailId}`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Draft not found or generation failed');
      }
      draft = await res.json();
      
      // Fetch newest drafts state
      const draftsRes = await fetch('/api/drafts');
      STATE.drafts = await draftsRes.json();
    } catch (err) {
      showToast(err.message || 'Failed to generate AI draft reply', 'error');
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
  // Folder Switcher Tab Clicks
  const folderBtns = document.querySelectorAll('.folder-btn');
  folderBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      const folder = btn.getAttribute('data-folder');
      if (folder === STATE.currentFolder) return;

      folderBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      STATE.currentFolder = folder;

      showToast(`Loading folder: ${folder.toUpperCase()}...`, 'info');
      
      // Fetch and render emails matching this folder
      await fetchEmails();

      // Automatically select the first email in the newly opened folder
      if (STATE.emails.length > 0) {
        selectEmail(STATE.emails[0].id);
      } else {
        renderEmptyWorkspace();
      }
    });
  });

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

  // Close AI Suggestion Panel Click
  const closeDraftBtn = document.getElementById('closeDraftBtn');
  if (closeDraftBtn) {
    closeDraftBtn.addEventListener('click', () => {
      const editorContainer = document.getElementById('workspaceDraftEditor');
      if (editorContainer) {
        editorContainer.classList.add('hidden');
        showToast('AI suggestion panel collapsed.', 'info');

        // Show the triggering action button container again so they can re-open it
        const btnContainer = document.getElementById('triggerAiSuggestionBtnContainer');
        if (btnContainer) btnContainer.style.display = 'flex';
      }
    });
  }

  // Switch Tone Chip Clicks
  const chips = document.querySelectorAll('.tone-chip');
  chips.forEach(chip => {
    chip.addEventListener('click', async () => {
      if (chip.disabled) return;
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
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.error || 'Tone switcher regeneration failed');
        }
        
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
        showToast(err.message || 'Tone switcher regeneration failed', 'error');
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

      // Hide the draft suggestions pane entirely upon discard
      const editorContainer = document.getElementById('workspaceDraftEditor');
      if (editorContainer) {
        editorContainer.classList.add('hidden');
      }

      // Show the triggering AI Suggestion action button container again
      const btnContainer = document.getElementById('triggerAiSuggestionBtnContainer');
      if (btnContainer) btnContainer.style.display = 'flex';

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

  const configForm = document.getElementById('settingsForm');
  if (configForm) {
    // Save Settings Forms
    configForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
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
  }

  // Account Connect button clicks
  document.getElementById('connectGmailBtn').addEventListener('click', async () => {
    showToast('Redirecting to secure Google Accounts OAuth portal...', 'info');
    try {
      const res = await fetch('/api/auth/url');
      const data = await res.json();
      window.location.href = data.url;
    } catch (err) {
      showToast('Failed to construct Google OAuth2 redirection link', 'error');
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
  fetch('/api/preferences')
    .then(res => res.json())
    .then(preferences => {
      if (preferences) {
        document.getElementById('defaultTone').value = preferences.defaultTone;
        document.getElementById('customInstructions').value = preferences.customInstructions;
        document.getElementById('signature').value = preferences.signature;
      }
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

  // Save AI Config Form
  const aiForm = document.getElementById('aiConfigForm');
  if (aiForm) {
    aiForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        aiProvider: document.getElementById('aiProvider').value,
        geminiApiKey: document.getElementById('geminiApiKey').value,
        openaiApiKey: document.getElementById('openaiApiKey').value,
        anthropicApiKey: document.getElementById('anthropicApiKey').value
      };

      try {
        const res = await fetch('/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
          showToast('AI engine and credentials saved successfully.', 'success');
          await fetchConfig();
          await fetchLogs();
        } else {
          throw new Error(data.error);
        }
      } catch (err) {
        showToast(`Failed to save AI configuration: ${err.message}`, 'error');
      }
    });
  }

  // Handle AI Provider dropdown change to show/hide API key groups dynamically
  const providerSelect = document.getElementById('aiProvider');
  if (providerSelect) {
    const geminiGroup = document.getElementById('geminiKeyGroup');
    const openaiGroup = document.getElementById('openaiKeyGroup');
    const anthropicGroup = document.getElementById('anthropicKeyGroup');
    
    function toggleKeyGroups() {
      const val = providerSelect.value;
      if (geminiGroup) geminiGroup.style.display = val === 'gemini' ? 'block' : 'none';
      if (openaiGroup) openaiGroup.style.display = val === 'openai' ? 'block' : 'none';
      if (anthropicGroup) anthropicGroup.style.display = val === 'anthropic' ? 'block' : 'none';
    }
    
    providerSelect.addEventListener('change', toggleKeyGroups);
    
    // Trigger it on select value populate
    setTimeout(toggleKeyGroups, 100);
  }

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
