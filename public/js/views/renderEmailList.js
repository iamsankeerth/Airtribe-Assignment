import { escapeHTML } from '../shared/ui.js';

export function renderEmailList(viewModel, onSelectEmail) {
  const { emails, currentFolder, selectedEmailId } = viewModel;
  const container = document.getElementById('emailListContainer');
  container.innerHTML = '';
  document.getElementById('emailCount').textContent = emails.length;

  if (emails.length === 0) {
    let folderName = (currentFolder || 'inbox').toUpperCase();
    if (folderName === 'ALL') folderName = 'ALL MAIL';
    container.innerHTML = `<div class="empty-workspace-state"><h3>${folderName} Empty</h3><p>No messages found. Sync your inbox to fetch new messages.</p></div>`;
    return;
  }

  emails.forEach(email => {
    const isSelected = email.id === selectedEmailId;
    const isUnread = !email.isRead;

    let dateString = 'Unknown Date';
    try {
      const dateObj = new Date(email.timestamp);
      if (!Number.isNaN(dateObj.getTime())) {
        dateString = `${dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      }
    } catch (err) {
      console.error('Error formatting date in email list:', err);
    }

    const item = document.createElement('div');
    item.className = `email-item ${isSelected ? 'selected' : ''} ${isUnread ? 'unread' : ''}`;
    item.id = `email-item-${email.id}`;

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

    item.addEventListener('click', () => onSelectEmail(email.id));
    container.appendChild(item);
  });
}
