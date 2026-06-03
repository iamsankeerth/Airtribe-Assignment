async function request(url, options = {}) {
  const response = await fetch(url, options);
  const isJson = response.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const message = typeof data === 'string' ? data : data?.error || response.statusText;
    throw new Error(message);
  }

  return data;
}

export const apiClient = {
  getConfig: () => request('/api/config'),
  saveConfig: payload => request('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),
  getAuthUrl: () => request('/api/auth/url'),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  getEmails: folder => request(`/api/emails?folder=${folder}`),
  syncEmails: () => request('/api/emails/sync', { method: 'POST' }),
  getDrafts: () => request('/api/drafts'),
  getDraft: emailId => request(`/api/drafts/${emailId}`),
  regenerateDraft: (emailId, tone) => request(`/api/drafts/${emailId}/regenerate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tone })
  }),
  updateDraft: (draftId, content) => request(`/api/drafts/${draftId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content })
  }),
  approveDraft: draftId => request(`/api/drafts/${draftId}/approve`, { method: 'POST' }),
  rejectDraft: draftId => request(`/api/drafts/${draftId}/reject`, { method: 'POST' }),
  getStyleProfile: () => request('/api/style/profile'),
  learnStyleProfile: () => request('/api/style/learn', { method: 'POST' }),
  getPreferences: () => request('/api/preferences'),
  savePreferences: payload => request('/api/preferences', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }),
  getLogs: () => request('/api/logs')
};
