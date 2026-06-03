function setToneChipsDisabled(disabled) {
  document.querySelectorAll('.tone-chip').forEach(chip => {
    chip.disabled = disabled;
    chip.classList.toggle('disabled', disabled);
  });
}

export function hideDraftEditor() {
  document.getElementById('workspaceDraftEditor').classList.add('hidden');
}

export function renderDraftEditor(draftView) {
  const editorContainer = document.getElementById('workspaceDraftEditor');
  const draftTextarea = document.getElementById('draftTextArea');
  const draftStatusBadge = document.getElementById('draftStatusBadge');
  const draftTimestamp = document.getElementById('draftTimestamp');
  const retryStatusText = document.getElementById('retryStatusText');
  const triggerContainer = document.getElementById('triggerAiSuggestionBtnContainer');

  if (!draftView || !draftView.visible) {
    editorContainer.classList.add('hidden');
    if (triggerContainer) triggerContainer.style.display = 'flex';
    return;
  }

  editorContainer.classList.remove('hidden');
  if (triggerContainer) triggerContainer.style.display = 'none';

  setToneChipsDisabled(draftView.toneDisabled);
  draftTextarea.value = draftView.content || '';
  draftTextarea.placeholder = draftView.placeholder || '';
  draftTextarea.disabled = draftView.disabled;
  draftStatusBadge.textContent = draftView.statusLabel;
  draftStatusBadge.className = draftView.statusClassName;
  draftTimestamp.textContent = draftView.timestampLabel;

  if (draftView.tone) {
    document.querySelectorAll('.tone-chip').forEach(chip => {
      chip.classList.toggle('active', chip.getAttribute('data-tone') === draftView.tone);
    });
  }

  if (draftView.retryMessage) {
    retryStatusText.classList.remove('hidden');
    retryStatusText.innerHTML = draftView.retryMessage;
  } else {
    retryStatusText.classList.add('hidden');
  }

  document.getElementById('saveDraftBtn').disabled = draftView.locked;
  document.getElementById('approveSendBtn').disabled = draftView.locked;
  document.getElementById('rejectDraftBtn').disabled = draftView.locked;
  document.getElementById('approveSendBtn').innerHTML = draftView.approveLabel;
}
