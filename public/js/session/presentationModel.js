import { getReplyEligibility } from '../shared/email.js';

function formatDraftTimestamp(draft) {
  const draftDate = new Date(draft.updatedAt || draft.createdAt);
  return `Suggested ${draftDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function buildDraftPanelModel(state, selectedEmail, selectedDraft) {
  if (!state.draftPanelOpen || !selectedEmail) {
    return {
      visible: false
    };
  }

  const eligibility = getReplyEligibility(selectedEmail);
  if (!eligibility.canDraft) {
    return {
      visible: true,
      content: eligibility.message || 'Suggestion unavailable.',
      placeholder: '',
      disabled: true,
      statusLabel: eligibility.reason === 'sent' ? 'Sent Mail' : 'No Reply',
      statusClassName: 'status-indicator-tag status-failed',
      timestampLabel: 'Suggestion unavailable',
      retryMessage: null,
      locked: true,
      toneDisabled: true,
      approveLabel: eligibility.reason === 'sent'
        ? '<i class="fa-solid fa-ban"></i> Inbox Only'
        : '<i class="fa-solid fa-ban"></i> Cannot Send'
    };
  }

  if (!selectedDraft) {
    return {
      visible: true,
      content: '',
      placeholder: 'AI generating draft...',
      disabled: true,
      statusLabel: 'Suggested',
      statusClassName: 'status-indicator-tag',
      timestampLabel: 'Generating draft...',
      retryMessage: null,
      locked: true,
      toneDisabled: true,
      approveLabel: '<i class="fa-solid fa-paper-plane"></i> Approve & Send'
    };
  }

  const isLocked = selectedDraft.status === 'Sent' || selectedDraft.status === 'Sending';
  let retryMessage = null;
  if (selectedDraft.status === 'Retrying') {
    retryMessage = `<i class="fa-solid fa-arrows-spin fa-spin"></i> Retry #${selectedDraft.retryCount}/5 failed sends...`;
  } else if (selectedDraft.status === 'Sending') {
    retryMessage = '<i class="fa-solid fa-spinner fa-spin"></i> SMTP Dispatched, locking thread...';
  }

  return {
    visible: true,
    content: selectedDraft.content,
    placeholder: '',
    disabled: isLocked,
    statusLabel: selectedDraft.status,
    statusClassName: `status-indicator-tag status-${selectedDraft.status.toLowerCase()}`,
    timestampLabel: formatDraftTimestamp(selectedDraft),
    retryMessage,
    locked: isLocked,
    toneDisabled: false,
    tone: selectedDraft.tone,
    approveLabel: isLocked
      ? '<i class="fa-solid fa-circle-check"></i> Sent'
      : '<i class="fa-solid fa-paper-plane"></i> Approve & Send'
  };
}

export function buildDashboardPresentation(state) {
  const selectedEmail = state.emails.find(email => email.id === state.selectedEmailId) || null;
  const selectedDraft = state.drafts.find(draft => draft.emailId === state.selectedEmailId) || null;
  const selectedEligibility = selectedEmail ? getReplyEligibility(selectedEmail) : null;
  const sentCount = state.drafts.filter(draft => draft.status === 'Sent').length;
  const failedCount = state.drafts.filter(draft => draft.status === 'Failed').length;
  const totalSendAttempts = sentCount + failedCount;

  return {
    emailList: {
      emails: state.emails,
      currentFolder: state.currentFolder,
      selectedEmailId: state.selectedEmailId
    },
    emailDetail: selectedEmail
      ? {
          email: selectedEmail,
          actionLabel: selectedEligibility && !selectedEligibility.canDraft ? 'Suggestion Locked' : 'AI Suggestion',
          eligibility: selectedEligibility
        }
      : null,
    draftPanel: buildDraftPanelModel(state, selectedEmail, selectedDraft),
    stats: {
      fetchedCount: state.emails.length,
      sentCount,
      successRateText: totalSendAttempts === 0
        ? '100%'
        : `${Math.round((sentCount / totalSendAttempts) * 100)}%`
    }
  };
}
