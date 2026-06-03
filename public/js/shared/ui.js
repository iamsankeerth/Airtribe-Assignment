export function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, tag => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[tag] || tag));
}

export function showToast(message, type = 'info') {
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

  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s ease reverse forwards';
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 4500);
}

export function scrollWorkspaceToTop() {
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

export function scrollWorkspaceToDraftEditor() {
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
