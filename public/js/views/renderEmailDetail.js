import { escapeHTML } from '../shared/ui.js';

export function renderEmptyWorkspace() {
  document.getElementById('workspaceEmailDetail').innerHTML = `
    <div class="empty-workspace-state">
      <i class="fa-solid fa-envelope-open-text"></i>
      <h3>No Email Selected</h3>
      <p>Select an email from the inbox list to generate and manage draft replies.</p>
    </div>
  `;
}

export function renderEmailDetail(detailModel, onOpenDraft) {
  if (!detailModel || !detailModel.email) {
    renderEmptyWorkspace();
    return;
  }

  const { email, actionLabel, eligibility } = detailModel;

  let dateString = 'Unknown Date';
  try {
    const dateObj = new Date(email.timestamp);
    if (!Number.isNaN(dateObj.getTime())) {
      dateString = `${dateObj.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} ${dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
  } catch (err) {
    console.error('Error formatting date in select email:', err);
  }

  const isHtml = /<[a-z][\s\S]*>/i.test(email.body);
  const isSentEmail = (email.folder || '').toLowerCase() === 'sent';
  const contactLabel = isSentEmail ? 'To' : 'From';
  const contactValue = isSentEmail ? email.recipient : email.sender;

  const triggerButtonClass = eligibility && !eligibility.canDraft
    ? 'btn btn-secondary'
    : 'btn btn-accent btn-glow';

  const detailContainer = document.getElementById('workspaceEmailDetail');
  detailContainer.innerHTML = `
    <div class="email-full-header">
      <h2 class="email-full-title">${escapeHTML(email.subject)}</h2>
      <div class="email-meta-row">
        <div class="email-meta-from">${contactLabel}: <strong>${escapeHTML(contactValue || '')}</strong></div>
        <div class="email-meta-actions" id="triggerAiSuggestionBtnContainer">
          <button class="${triggerButtonClass}" id="triggerAiSuggestionBtn">${escapeHTML(actionLabel || 'AI Suggestion')}</button>
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
          iframe.style.height = `${height + 25}px`;
        } catch (err) {
          console.warn('Could not auto-adjust iframe height:', err);
          iframe.style.height = '800px';
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

  document.getElementById('triggerAiSuggestionBtn').addEventListener('click', onOpenDraft);
}
