const STORAGE_PREFIX = 'akshaconnect:draft:v1';
const MAX_DRAFT_CHARS = 8000;

function clean(value) {
  return value == null ? '' : String(value).trim();
}

export function conversationDraftKey({
  identityId,
  workspaceId,
  conversationId,
} = {}) {
  const identity = clean(identityId);
  const workspace = clean(workspaceId);
  const conversation = clean(conversationId);

  if (!identity || !workspace || !conversation) {
    return '';
  }

  return [
    STORAGE_PREFIX,
    encodeURIComponent(identity),
    encodeURIComponent(workspace),
    encodeURIComponent(conversation),
  ].join(':');
}

export function loadConversationDraft(scope) {
  const key = conversationDraftKey(scope);
  if (!key) return '';

  try {
    return window.localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

export function saveConversationDraft(scope, value) {
  const key = conversationDraftKey(scope);
  if (!key) return;

  const text = String(value ?? '').slice(0, MAX_DRAFT_CHARS);

  try {
    if (!text) {
      window.localStorage.removeItem(key);
      return;
    }

    window.localStorage.setItem(key, text);
  } catch {
    // Draft persistence is best-effort; message composition must remain usable.
  }
}

export function clearConversationDraft(scope) {
  saveConversationDraft(scope, '');
}
