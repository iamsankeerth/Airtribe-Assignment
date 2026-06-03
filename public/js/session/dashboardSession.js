import { apiClient } from './apiClient.js';
import { normalizeDraft, normalizeDrafts, getReplyEligibility } from '../shared/email.js';
import { buildDashboardPresentation } from './presentationModel.js';
import { showToast, scrollWorkspaceToDraftEditor, scrollWorkspaceToTop } from '../shared/ui.js';
import { renderEmailList } from '../views/renderEmailList.js';
import { renderEmailDetail, renderEmptyWorkspace } from '../views/renderEmailDetail.js';
import { renderDraftEditor, hideDraftEditor } from '../views/renderDraftEditor.js';
import { renderStyleProfile } from '../views/renderStyleProfile.js';
import { renderLogs } from '../views/renderLogs.js';
import { renderSettings } from '../views/renderSettings.js';

export function createDashboardSession() {
  const state = {
    activeTab: 'inbox',
    currentFolder: 'inbox',
    emails: [],
    drafts: [],
    selectedEmailId: null,
    activeTone: 'Concise',
    config: {},
    styleProfile: {},
    preferences: null,
    logs: [],
    draftPanelOpen: false,
    pollIntervalId: null
  };

  function getSelectedEmail() {
    return state.emails.find(email => email.id === state.selectedEmailId) || null;
  }

  function getSelectedDraft() {
    return state.drafts.find(draft => draft.emailId === state.selectedEmailId) || null;
  }

  function updateStatsUI(stats) {
    document.getElementById('statProcessed').textContent = stats.fetchedCount;
    document.getElementById('statSent').textContent = stats.sentCount;
    document.getElementById('statSuccess').textContent = stats.successRateText;
  }

  function renderAll() {
    const presentation = buildDashboardPresentation(state);
    renderEmailList(presentation.emailList, selectEmail);

    if (presentation.emailDetail) {
      renderEmailDetail(presentation.emailDetail, () => openDraft(presentation.emailDetail.email.id));
    } else {
      renderEmptyWorkspace();
    }

    renderDraftEditor(presentation.draftPanel);
    renderStyleProfile(state.styleProfile);
    renderLogs(state.logs);
    renderSettings(state);
    updateStatsUI(presentation.stats);
  }

  async function fetchConfig() {
    state.config = await apiClient.getConfig();
  }

  async function fetchEmails() {
    state.emails = await apiClient.getEmails(state.currentFolder || 'inbox');
  }

  async function fetchDrafts() {
    state.drafts = normalizeDrafts(await apiClient.getDrafts());
  }

  async function fetchStyleProfile() {
    state.styleProfile = await apiClient.getStyleProfile();
  }

  async function fetchPreferences() {
    state.preferences = await apiClient.getPreferences();
  }

  async function fetchLogs() {
    state.logs = await apiClient.getLogs();
  }

  async function preloadDraftForEmail(emailId) {
    const email = state.emails.find(entry => entry.id === emailId);
    const eligibility = getReplyEligibility(email);
    if (!email || !eligibility.canDraft) return null;

    const existingDraft = state.drafts.find(draft => draft.emailId === emailId);
    if (existingDraft) return existingDraft;

    try {
      const draft = normalizeDraft(await apiClient.getDraft(emailId));
      const existingIndex = state.drafts.findIndex(entry => entry.emailId === emailId);
      if (existingIndex >= 0) {
        state.drafts[existingIndex] = draft;
      } else {
        state.drafts.push(draft);
      }
      return draft;
    } catch (err) {
      console.error('Background draft preload failed:', err);
      return null;
    }
  }

  async function selectEmail(emailId) {
    state.selectedEmailId = emailId;
    state.draftPanelOpen = false;
    renderAll();

    if (state.selectedEmailId) {
      scrollWorkspaceToTop();
      preloadDraftForEmail(emailId);
    }
  }

  async function openDraft(emailId) {
    const email = state.emails.find(entry => entry.id === emailId);
    if (!email) return;

    state.selectedEmailId = emailId;
    state.draftPanelOpen = true;
    renderAll();
    scrollWorkspaceToDraftEditor();

    const eligibility = getReplyEligibility(email);
    if (!eligibility.canDraft) {
      showToast(eligibility.message || 'Suggestion unavailable.', eligibility.reason === 'sent' ? 'info' : 'warning');
      return;
    }

    let draft = getSelectedDraft();
    if (!draft) {
      document.querySelector('.draft-editor-container').classList.add('generating');
      try {
        draft = normalizeDraft(await apiClient.getDraft(emailId));
        await fetchDrafts();
      } catch (err) {
        showToast(err.message || 'Failed to generate AI draft reply', 'error');
        state.draftPanelOpen = false;
      } finally {
        document.querySelector('.draft-editor-container').classList.remove('generating');
      }
    }

    renderDraftEditor(buildDashboardPresentation(state).draftPanel);
  }

  async function changeFolder(folder) {
    if (folder === state.currentFolder) return;
    state.currentFolder = folder;
    showToast(`Loading folder: ${folder.toUpperCase()}...`, 'info');
    await fetchEmails();

    if (state.emails.length > 0) {
      state.selectedEmailId = state.emails[0].id;
      state.draftPanelOpen = false;
    } else {
      state.selectedEmailId = null;
      state.draftPanelOpen = false;
    }

    renderAll();
  }

  async function syncInbox() {
    const syncBtn = document.getElementById('syncInboxBtn');
    syncBtn.disabled = true;
    syncBtn.querySelector('i').classList.add('fa-spin');
    syncBtn.querySelector('span').textContent = 'Syncing...';
    showToast('Connecting Gmail servers to retrieve new messages...', 'info');

    try {
      const data = await apiClient.syncEmails();
      if (!data.success) {
        throw new Error(data.error || 'Sync failed');
      }
      showToast('Inbox sync completed successfully.', 'success');
      await Promise.all([fetchEmails(), fetchDrafts(), fetchLogs()]);
      if (state.emails.length && !state.selectedEmailId) {
        state.selectedEmailId = state.emails[0].id;
      }
      renderAll();
    } catch (err) {
      showToast(`Sync Failed: ${err.message}`, 'error');
    } finally {
      syncBtn.disabled = false;
      syncBtn.querySelector('i').classList.remove('fa-spin');
      syncBtn.querySelector('span').textContent = 'Sync Inbox';
    }
  }

  function closeDraftPanel() {
    state.draftPanelOpen = false;
    hideDraftEditor();
    const triggerContainer = document.getElementById('triggerAiSuggestionBtnContainer');
    if (triggerContainer) triggerContainer.style.display = 'flex';
    showToast('AI suggestion panel collapsed.', 'info');
  }

  async function changeTone(tone) {
    if (!state.selectedEmailId || tone === state.activeTone) return;
    state.activeTone = tone;
    document.querySelector('.draft-editor-container').classList.add('generating');

    try {
      const updatedDraft = normalizeDraft(await apiClient.regenerateDraft(state.selectedEmailId, tone));
      await fetchDrafts();
      const existingIndex = state.drafts.findIndex(entry => entry.id === updatedDraft.id);
      if (existingIndex >= 0) {
        state.drafts[existingIndex] = updatedDraft;
      }
      renderDraftEditor(buildDashboardPresentation(state).draftPanel);
      showToast(`Draft regenerated with ${tone} tone`, 'info');
    } catch (err) {
      showToast(err.message || 'Tone switcher regeneration failed', 'error');
    } finally {
      document.querySelector('.draft-editor-container').classList.remove('generating');
    }
  }

  async function saveDraft() {
    const draft = getSelectedDraft();
    if (!draft) return;

    try {
      const editedContent = document.getElementById('draftTextArea').value;
      const updated = normalizeDraft(await apiClient.updateDraft(draft.id, editedContent));
      await fetchDrafts();
      const existingIndex = state.drafts.findIndex(entry => entry.id === updated.id);
      if (existingIndex >= 0) {
        state.drafts[existingIndex] = updated;
      }
      renderDraftEditor(buildDashboardPresentation(state).draftPanel);
      showToast('Draft edits saved successfully.', 'success');
      await fetchLogs();
      renderLogs(state.logs);
    } catch (err) {
      showToast('Failed to save draft edits', 'error');
    }
  }

  async function rejectDraft() {
    const draft = getSelectedDraft();
    if (!draft) return;
    if (!window.confirm('Are you sure you want to discard this draft suggestion? This will archive the reply.')) return;

    try {
      await apiClient.rejectDraft(draft.id);
      await fetchDrafts();
      state.draftPanelOpen = false;
      renderAll();
      showToast('Draft successfully discarded.', 'info');
      await fetchLogs();
      renderLogs(state.logs);
    } catch (err) {
      showToast('Failed to discard draft', 'error');
    }
  }

  async function approveDraft() {
    const draft = getSelectedDraft();
    if (!draft) return;

    try {
      const currentText = document.getElementById('draftTextArea').value;
      await apiClient.updateDraft(draft.id, currentText);
      showToast('Draft approved! Enqueued in Send Manager for immediate SMTP transmission.', 'success');
      await apiClient.approveDraft(draft.id);
      await fetchDrafts();
      renderDraftEditor(buildDashboardPresentation(state).draftPanel);
      await fetchLogs();
      renderLogs(state.logs);
    } catch (err) {
      showToast('Failed to process draft approval', 'error');
    }
  }

  async function learnStyleProfile() {
    const learnBtn = document.getElementById('learnStyleBtn');
    const progressTrack = document.getElementById('learningProgress');
    const fill = document.getElementById('progressFillBar');
    const text = document.getElementById('progressText');

    learnBtn.disabled = true;
    progressTrack.classList.remove('hidden');
    fill.style.width = '0%';
    text.textContent = 'Mapping outbox threads...';

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
      await apiClient.learnStyleProfile();
      clearInterval(interval);
      fill.style.width = '100%';
      text.textContent = 'Analysis Compiled!';
      setTimeout(async () => {
        progressTrack.classList.add('hidden');
        await fetchStyleProfile();
        await fetchLogs();
        renderStyleProfile(state.styleProfile);
        renderLogs(state.logs);
        showToast('Writing style profile learned successfully!', 'success');
        learnBtn.disabled = false;
      }, 800);
    } catch (err) {
      clearInterval(interval);
      progressTrack.classList.add('hidden');
      showToast('Failed to compile writing style profile', 'error');
      learnBtn.disabled = false;
    }
  }

  async function savePreferences() {
    const payload = {
      defaultTone: document.getElementById('defaultTone').value,
      customInstructions: document.getElementById('customInstructions').value,
      signature: document.getElementById('signature').value
    };

    try {
      const response = await apiClient.savePreferences(payload);
      state.preferences = response.preferences;
      renderSettings(state);
      showToast('Writing preference templates updated successfully.', 'success');
      await fetchLogs();
      renderLogs(state.logs);
    } catch (err) {
      showToast('Failed to save writing preferences', 'error');
    }
  }

  async function saveAiConfig() {
    const payload = {
      clientId: document.getElementById('clientId').value,
      clientSecret: document.getElementById('clientSecret').value,
      aiProvider: document.getElementById('aiProvider').value,
      geminiApiKey: document.getElementById('geminiApiKey').value,
      openaiApiKey: document.getElementById('openaiApiKey').value,
      anthropicApiKey: document.getElementById('anthropicApiKey').value
    };

    try {
      await apiClient.saveConfig(payload);
      await fetchConfig();
      renderSettings(state);
      showToast('AI engine and credentials saved successfully.', 'success');
      await fetchLogs();
      renderLogs(state.logs);
    } catch (err) {
      showToast(`Failed to save AI configuration: ${err.message}`, 'error');
    }
  }

  async function connectGmail() {
    showToast('Redirecting to secure Google Accounts OAuth portal...', 'info');
    try {
      const data = await apiClient.getAuthUrl();
      window.location.href = data.url;
    } catch (err) {
      showToast(err.message || 'Failed to construct Google OAuth2 redirection link', 'error');
    }
  }

  async function disconnectGmail() {
    if (!window.confirm('Are you sure you want to disconnect Draftly from your Google account and revoke OAuth tokens?')) return;

    try {
      const data = await apiClient.logout();
      if (data.success) {
        await fetchConfig();
        await fetchLogs();
        renderSettings(state);
        renderLogs(state.logs);
        showToast('Google credentials cleared. Session terminated.', 'info');
      }
    } catch (err) {
      showToast('Logout request failed', 'error');
    }
  }

  async function poll() {
    try {
      const newLogs = await apiClient.getLogs();
      if (newLogs.length > state.logs.length) {
        state.logs = newLogs;
        state.drafts = normalizeDrafts(await apiClient.getDrafts());
        state.emails = await apiClient.getEmails(state.currentFolder || 'inbox');
        renderAll();
      }
    } catch (err) {
      console.error('Silent sync failed:', err);
    }
  }

  function setupNavigation() {
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.addEventListener('click', async () => {
        const targetView = tab.getAttribute('data-tab');
        document.querySelectorAll('.nav-tab').forEach(entry => entry.classList.remove('active'));
        tab.classList.add('active');

        document.querySelectorAll('.tab-content').forEach(view => view.classList.remove('active'));
        document.getElementById(`view-${targetView}`).classList.add('active');
        state.activeTab = targetView;

        if (targetView === 'logs') {
          await fetchLogs();
          renderLogs(state.logs);
        }
      });
    });

    const logoArea = document.querySelector('.logo-area');
    if (logoArea) {
      logoArea.style.cursor = 'pointer';
      logoArea.addEventListener('click', () => {
        document.querySelectorAll('.nav-tab').forEach(entry => entry.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(view => view.classList.remove('active'));
        document.getElementById('view-inbox').classList.add('active');
        state.activeTab = 'inbox';
      });
    }
  }

  function setupEventListeners() {
    document.querySelectorAll('.folder-btn').forEach(button => {
      button.addEventListener('click', async () => {
        document.querySelectorAll('.folder-btn').forEach(entry => entry.classList.remove('active'));
        button.classList.add('active');
        await changeFolder(button.getAttribute('data-folder'));
      });
    });

    document.getElementById('syncInboxBtn').addEventListener('click', syncInbox);
    document.getElementById('closeDraftBtn').addEventListener('click', closeDraftPanel);
    document.querySelectorAll('.tone-chip').forEach(chip => {
      chip.addEventListener('click', async () => {
        if (chip.disabled) return;
        await changeTone(chip.getAttribute('data-tone'));
      });
    });
    document.getElementById('saveDraftBtn').addEventListener('click', saveDraft);
    document.getElementById('rejectDraftBtn').addEventListener('click', rejectDraft);
    document.getElementById('approveSendBtn').addEventListener('click', approveDraft);
    document.getElementById('learnStyleBtn').addEventListener('click', learnStyleProfile);
    document.getElementById('connectGmailBtn').addEventListener('click', connectGmail);
    document.getElementById('disconnectGmailBtn').addEventListener('click', disconnectGmail);
    document.getElementById('preferencesForm').addEventListener('submit', async event => {
      event.preventDefault();
      await savePreferences();
    });
    document.getElementById('aiConfigForm').addEventListener('submit', async event => {
      event.preventDefault();
      await saveAiConfig();
    });
    document.getElementById('aiProvider').addEventListener('change', () => renderSettings(state));
    document.getElementById('clearLogsBtn').addEventListener('click', async () => {
      await fetchLogs();
      renderLogs(state.logs);
      showToast('Audit trail feeds re-synchronized.', 'success');
    });
  }

  async function init() {
    setupNavigation();
    setupEventListeners();

    try {
      await fetchConfig();
      await Promise.all([
        fetchEmails(),
        fetchDrafts(),
        fetchStyleProfile(),
        fetchPreferences(),
        fetchLogs()
      ]);

      if (state.emails.length > 0) {
        state.selectedEmailId = state.emails[0].id;
      }

      renderAll();

      if (state.config.isConnected) {
        apiClient.syncEmails().catch(err => {
          console.error('Background startup sync failed:', err);
        });
      }

      state.pollIntervalId = setInterval(() => {
        poll();
      }, 4000);
    } catch (err) {
      showToast(err.message || 'Failed to initialize Draftly dashboard', 'error');
    }
  }

  return {
    init,
    selectEmail,
    openDraft,
    changeFolder,
    syncInbox,
    changeTone,
    saveDraft,
    approveDraft,
    rejectDraft,
    learnStyleProfile,
    savePreferences,
    saveAiConfig,
    poll
  };
}
