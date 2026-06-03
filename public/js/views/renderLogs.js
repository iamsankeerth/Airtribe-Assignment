import { escapeHTML } from '../shared/ui.js';

export function renderLogs(logs) {
  const tbody = document.getElementById('logsTableBody');
  tbody.innerHTML = '';

  if (!logs.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">No activity logged yet.</td></tr>';
    return;
  }

  logs.forEach(log => {
    const tr = document.createElement('tr');
    const dateObj = new Date(log.timestamp);
    const timeStr = `${dateObj.toLocaleTimeString([], { hour12: false })}.${String(dateObj.getMilliseconds()).padStart(3, '0')}`;

    tr.innerHTML = `
      <td class="logs-timestamp">${timeStr}</td>
      <td class="logs-category">${log.category}</td>
      <td class="logs-severity severity-${log.severity.toLowerCase()}">${log.severity}</td>
      <td class="logs-message">${escapeHTML(log.message)}</td>
    `;

    tbody.appendChild(tr);
  });
}
