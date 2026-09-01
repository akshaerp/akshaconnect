const STORAGE_KEY = 'akshaconnect.local-session.v1';

export function loadStoredSession() {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.access_token !== 'string' || !parsed.access_token) {
      clearStoredSession();
      return null;
    }

    return parsed;
  } catch {
    clearStoredSession();
    return null;
  }
}

export function saveStoredSession(loginResult) {
  const snapshot = {
    access_token: loginResult.access_token,
    expires_at: loginResult.expires_at,
    session_id: loginResult.session_id,
    identity: loginResult.identity,
    workspace: loginResult.workspace,
    membership: loginResult.membership,
  };

  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  return snapshot;
}

export function clearStoredSession() {
  window.sessionStorage.removeItem(STORAGE_KEY);
}
