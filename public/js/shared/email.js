export function getReplyEligibility(email) {
  if (email && email.replyEligibility) {
    return email.replyEligibility;
  }

  return {
    canDraft: true,
    reason: null,
    message: null
  };
}

export function sanitizeDraftContent(content) {
  if (typeof content !== 'string') return content;
  return content.replace(/Demo User/g, 'Sankeerth Masetty');
}

export function normalizeDraft(draft) {
  if (!draft || typeof draft !== 'object') return draft;
  return {
    ...draft,
    content: sanitizeDraftContent(draft.content)
  };
}

export function normalizeDrafts(drafts) {
  if (!Array.isArray(drafts)) return [];
  return drafts.map(normalizeDraft);
}
