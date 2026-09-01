import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ApiError,
  createChannel,
  inspectSession,
  listChannels,
  listDirectMessages,
  listMembers,
  loginLocal,
  logout,
  startDirectMessage,
} from './api.js';
import {
  clearStoredSession,
  loadStoredSession,
  saveStoredSession,
} from './sessionStore.js';

function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'AC';
}

function sessionFromLogin(login) {
  return {
    identity_id: login.identity.identity_id,
    display_name: login.identity.display_name,
    primary_email: login.identity.primary_email,
    workspace_id: login.workspace.workspace_id,
    workspace_code: login.workspace.workspace_code,
    workspace_name: login.workspace.workspace_name,
    workspace_member_id: login.membership.workspace_member_id,
    member_role: login.membership.member_role,
    session_id: login.session_id,
  };
}

function LoginScreen({ onLogin }) {
  const [workspaceCode, setWorkspaceCode] = useState('DEV_ALPHA');
  const [loginName, setLoginName] = useState('dev-alice');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');

    try {
      await onLogin({ workspaceCode, loginName, password });
    } catch (requestError) {
      setError(requestError.message || 'Sign in failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="brand-lockup brand-lockup-login">
          <div className="brand-mark" aria-hidden="true">A</div>
          <div>
            <div className="brand-name">AkshaConnect</div>
            <div className="brand-tagline">Work together. Stay connected.</div>
          </div>
        </div>

        <div className="login-heading">
          <p className="eyebrow">Standalone workspace</p>
          <h1 id="login-title">Sign in to your team</h1>
          <p>Use your workspace code and AkshaConnect account.</p>
        </div>

        <form className="login-form" onSubmit={submit}>
          <label>
            <span>Workspace code</span>
            <input
              autoComplete="organization"
              value={workspaceCode}
              onChange={(event) => setWorkspaceCode(event.target.value)}
              required
            />
          </label>

          <label>
            <span>Login name</span>
            <input
              autoComplete="username"
              value={loginName}
              onChange={(event) => setLoginName(event.target.value)}
              required
            />
          </label>

          <label>
            <span>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          {error ? <div className="form-error" role="alert">{error}</div> : null}

          <button className="primary-button login-button" type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="login-footnote">P1-V4 minimum functional web client</p>
      </section>
    </main>
  );
}

function SectionHeader({ title, actionLabel, onAction }) {
  return (
    <div className="section-header">
      <span>{title}</span>
      <button className="icon-button" type="button" onClick={onAction} aria-label={actionLabel} title={actionLabel}>
        +
      </button>
    </div>
  );
}

function ChannelCreatePanel({ onCancel, onCreate }) {
  const [channelName, setChannelName] = useState('');
  const [visibility, setVisibility] = useState('PUBLIC');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');

    try {
      await onCreate({ channelName, visibility });
    } catch (requestError) {
      setError(requestError.message || 'Could not create channel');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="popover-panel">
      <div className="popover-title-row">
        <div>
          <strong>Create channel</strong>
          <span>Start a new team space</span>
        </div>
        <button type="button" className="close-button" onClick={onCancel} aria-label="Close">×</button>
      </div>
      <form onSubmit={submit} className="compact-form">
        <label>
          <span>Name</span>
          <input
            autoFocus
            value={channelName}
            onChange={(event) => setChannelName(event.target.value)}
            placeholder="e.g. Sales team"
            maxLength={160}
            required
          />
        </label>
        <label>
          <span>Visibility</span>
          <select value={visibility} onChange={(event) => setVisibility(event.target.value)}>
            <option value="PUBLIC">Public</option>
            <option value="PRIVATE">Private</option>
          </select>
        </label>
        {error ? <div className="form-error compact-error" role="alert">{error}</div> : null}
        <button className="primary-button" type="submit" disabled={busy}>
          {busy ? 'Creating…' : 'Create channel'}
        </button>
      </form>
    </div>
  );
}

function DirectMessagePicker({ token, currentMemberId, onCancel, onStart }) {
  const [query, setQuery] = useState('');
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyMemberId, setBusyMemberId] = useState('');
  const [error, setError] = useState('');

  const search = useCallback(async (searchText) => {
    setLoading(true);
    setError('');
    try {
      const result = await listMembers(token, searchText);
      setMembers(result.members || []);
    } catch (requestError) {
      setError(requestError.message || 'Could not load members');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    search('');
  }, [search]);

  async function submitSearch(event) {
    event.preventDefault();
    await search(query);
  }

  async function choose(member) {
    setBusyMemberId(member.workspace_member_id);
    setError('');
    try {
      await onStart(member);
    } catch (requestError) {
      setError(requestError.message || 'Could not start direct message');
    } finally {
      setBusyMemberId('');
    }
  }

  const available = members.filter((member) => member.workspace_member_id !== currentMemberId);

  return (
    <div className="popover-panel dm-picker">
      <div className="popover-title-row">
        <div>
          <strong>New message</strong>
          <span>Choose someone in this workspace</span>
        </div>
        <button type="button" className="close-button" onClick={onCancel} aria-label="Close">×</button>
      </div>

      <form className="member-search" onSubmit={submitSearch}>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search people"
          aria-label="Search workspace members"
        />
        <button type="submit" className="secondary-button">Search</button>
      </form>

      {error ? <div className="form-error compact-error" role="alert">{error}</div> : null}

      <div className="member-results">
        {loading ? <div className="muted-state">Loading people…</div> : null}
        {!loading && available.length === 0 ? <div className="muted-state">No matching people</div> : null}
        {available.map((member) => (
          <button
            className="member-result"
            type="button"
            key={member.workspace_member_id}
            onClick={() => choose(member)}
            disabled={busyMemberId === member.workspace_member_id}
          >
            <span className="avatar avatar-small">{initials(member.display_name)}</span>
            <span className="member-result-copy">
              <strong>{member.display_name}</strong>
              <small>{member.primary_email || member.member_role}</small>
            </span>
            <span className="member-result-action">{busyMemberId === member.workspace_member_id ? 'Opening…' : 'Message'}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ConversationPlaceholder({ selected }) {
  if (!selected) {
    return (
      <div className="conversation-empty">
        <div className="empty-illustration" aria-hidden="true">AC</div>
        <h2>Choose a conversation</h2>
        <p>Select a channel or direct message from the sidebar.</p>
      </div>
    );
  }

  return (
    <>
      <header className="conversation-header">
        <div>
          <div className="conversation-title">
            {selected.kind === 'channel' ? <span className="channel-symbol">#</span> : null}
            <h2>{selected.title}</h2>
          </div>
          <p>{selected.subtitle}</p>
        </div>
        <span className="phase-badge">P1-V4</span>
      </header>

      <div className="conversation-body">
        <div className="welcome-message">
          <div className="welcome-icon">{selected.kind === 'channel' ? '#' : initials(selected.title)}</div>
          <h3>{selected.kind === 'channel' ? `Welcome to #${selected.title}` : `Direct message with ${selected.title}`}</h3>
          <p>
            This conversation shell is connected to the real AkshaConnect workspace APIs.
            Durable message history is enabled in the next checkpoint.
          </p>
        </div>
      </div>

      <footer className="composer-shell">
        <div className="composer-box composer-disabled" title="Durable messaging becomes active in P1-V5">
          <textarea
            disabled
            rows={2}
            aria-label="Message composer"
            placeholder={`Message ${selected.kind === 'channel' ? `#${selected.title}` : selected.title} — available in P1-V5`}
          />
          <div className="composer-actions">
            <span>Messaging activates in P1-V5</span>
            <button type="button" disabled>Send</button>
          </div>
        </div>
      </footer>
    </>
  );
}

export default function App() {
  const stored = useMemo(() => loadStoredSession(), []);
  const [token, setToken] = useState(stored?.access_token || '');
  const [session, setSession] = useState(stored ? sessionFromLogin(stored) : null);
  const [channels, setChannels] = useState([]);
  const [directMessages, setDirectMessages] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loadingWorkspace, setLoadingWorkspace] = useState(Boolean(stored));
  const [globalError, setGlobalError] = useState('');
  const [showChannelCreate, setShowChannelCreate] = useState(false);
  const [showDmPicker, setShowDmPicker] = useState(false);

  const clearSession = useCallback(() => {
    clearStoredSession();
    setToken('');
    setSession(null);
    setChannels([]);
    setDirectMessages([]);
    setSelected(null);
    setLoadingWorkspace(false);
  }, []);

  const handleApiFailure = useCallback((error) => {
    if (error instanceof ApiError && error.status === 401) {
      clearSession();
      setGlobalError('Your session ended. Please sign in again.');
      return true;
    }
    return false;
  }, [clearSession]);

  const refreshNavigation = useCallback(async (activeToken, preferredSelection = null) => {
    const [channelPayload, dmPayload] = await Promise.all([
      listChannels(activeToken),
      listDirectMessages(activeToken),
    ]);

    const nextChannels = channelPayload.channels || [];
    const nextDms = dmPayload.direct_messages || [];
    setChannels(nextChannels);
    setDirectMessages(nextDms);

    if (preferredSelection) {
      setSelected(preferredSelection);
      return;
    }

    setSelected((current) => {
      if (current?.kind === 'channel') {
        const channelStillExists = nextChannels.find((item) => item.conversation_id === current.id);
        if (channelStillExists) return current;
      }
      if (current?.kind === 'dm') {
        const dmStillExists = nextDms.find((item) => item.conversation_id === current.id);
        if (dmStillExists) return current;
      }

      if (nextChannels[0]) {
        return {
          kind: 'channel',
          id: nextChannels[0].conversation_id,
          title: nextChannels[0].channel_name,
          subtitle: nextChannels[0].visibility === 'PRIVATE' ? 'Private channel' : 'Public channel',
        };
      }

      if (nextDms[0]) {
        return {
          kind: 'dm',
          id: nextDms[0].conversation_id,
          title: nextDms[0].other_display_name,
          subtitle: nextDms[0].other_primary_email || 'Direct message',
        };
      }

      return null;
    });
  }, []);

  useEffect(() => {
    if (!token) return undefined;

    let cancelled = false;

    async function restore() {
      setLoadingWorkspace(true);
      setGlobalError('');
      try {
        const inspected = await inspectSession(token);
        if (cancelled) return;
        setSession(inspected.claims);
        await refreshNavigation(token);
      } catch (error) {
        if (!cancelled && !handleApiFailure(error)) {
          clearSession();
          setGlobalError(error.message || 'Could not restore your session');
        }
      } finally {
        if (!cancelled) setLoadingWorkspace(false);
      }
    }

    restore();
    return () => {
      cancelled = true;
    };
  }, [token, refreshNavigation, handleApiFailure, clearSession]);

  async function handleLogin(credentials) {
    setGlobalError('');
    const login = await loginLocal(credentials);
    const snapshot = saveStoredSession(login);
    setSession(sessionFromLogin(snapshot));
    setToken(snapshot.access_token);
  }

  async function handleLogout() {
    try {
      if (token) await logout(token);
    } catch {
      // Local client state is still cleared; server-side expiry/revocation remains authoritative.
    } finally {
      clearSession();
    }
  }

  async function handleCreateChannel(input) {
    try {
      const result = await createChannel(token, input);
      const channel = result.channel;
      await refreshNavigation(token, {
        kind: 'channel',
        id: channel.conversation_id,
        title: channel.channel_name,
        subtitle: channel.visibility === 'PRIVATE' ? 'Private channel' : 'Public channel',
      });
      setShowChannelCreate(false);
    } catch (error) {
      handleApiFailure(error);
      throw error;
    }
  }

  async function handleStartDm(member) {
    try {
      const result = await startDirectMessage(token, member.workspace_member_id);
      const dm = result.direct_message;
      await refreshNavigation(token, {
        kind: 'dm',
        id: dm.conversation_id,
        title: member.display_name,
        subtitle: member.primary_email || 'Direct message',
      });
      setShowDmPicker(false);
    } catch (error) {
      handleApiFailure(error);
      throw error;
    }
  }

  if (!token) {
    return (
      <>
        {globalError ? <div className="global-banner">{globalError}</div> : null}
        <LoginScreen onLogin={handleLogin} />
      </>
    );
  }

  if (loadingWorkspace || !session) {
    return (
      <main className="loading-page">
        <div className="brand-mark loading-mark">A</div>
        <strong>Opening AkshaConnect…</strong>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <aside className="workspace-sidebar">
        <div className="workspace-top">
          <div className="brand-lockup sidebar-brand">
            <div className="brand-mark brand-mark-small">A</div>
            <span>AkshaConnect</span>
          </div>

          <div className="workspace-card">
            <div>
              <strong>{session.workspace_name}</strong>
              <span>{session.workspace_code}</span>
            </div>
            <span className="workspace-status-dot" title="Connected" />
          </div>
        </div>

        <nav className="workspace-nav" aria-label="Workspace conversations">
          <div className="nav-section">
            <SectionHeader
              title="Channels"
              actionLabel="Create channel"
              onAction={() => {
                setShowChannelCreate((value) => !value);
                setShowDmPicker(false);
              }}
            />

            {showChannelCreate ? (
              <ChannelCreatePanel
                onCancel={() => setShowChannelCreate(false)}
                onCreate={handleCreateChannel}
              />
            ) : null}

            <div className="nav-items">
              {channels.map((channel) => {
                const active = selected?.kind === 'channel' && selected.id === channel.conversation_id;
                return (
                  <button
                    type="button"
                    className={`nav-item ${active ? 'active' : ''}`}
                    key={channel.channel_id}
                    onClick={() => setSelected({
                      kind: 'channel',
                      id: channel.conversation_id,
                      title: channel.channel_name,
                      subtitle: channel.visibility === 'PRIVATE' ? 'Private channel' : 'Public channel',
                    })}
                  >
                    <span className="nav-icon">#</span>
                    <span className="nav-label">{channel.channel_name}</span>
                    {channel.visibility === 'PRIVATE' ? <span className="private-dot">•</span> : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="nav-section dm-section">
            <SectionHeader
              title="Direct messages"
              actionLabel="New direct message"
              onAction={() => {
                setShowDmPicker((value) => !value);
                setShowChannelCreate(false);
              }}
            />

            {showDmPicker ? (
              <DirectMessagePicker
                token={token}
                currentMemberId={session.workspace_member_id}
                onCancel={() => setShowDmPicker(false)}
                onStart={handleStartDm}
              />
            ) : null}

            <div className="nav-items">
              {directMessages.map((dm) => {
                const active = selected?.kind === 'dm' && selected.id === dm.conversation_id;
                return (
                  <button
                    type="button"
                    className={`nav-item dm-nav-item ${active ? 'active' : ''}`}
                    key={dm.conversation_id}
                    onClick={() => setSelected({
                      kind: 'dm',
                      id: dm.conversation_id,
                      title: dm.other_display_name,
                      subtitle: dm.other_primary_email || 'Direct message',
                    })}
                  >
                    <span className="avatar avatar-tiny">{initials(dm.other_display_name)}</span>
                    <span className="nav-label">{dm.other_display_name}</span>
                  </button>
                );
              })}
              {directMessages.length === 0 ? <div className="nav-empty">No direct messages yet</div> : null}
            </div>
          </div>
        </nav>

        <div className="profile-card">
          <span className="avatar">{initials(session.display_name)}</span>
          <span className="profile-copy">
            <strong>{session.display_name}</strong>
            <small>{session.member_role}</small>
          </span>
          <button type="button" className="logout-button" onClick={handleLogout}>Sign out</button>
        </div>
      </aside>

      <main className="conversation-panel">
        {globalError ? <div className="global-banner in-app-banner">{globalError}</div> : null}
        <ConversationPlaceholder selected={selected} />
      </main>
    </div>
  );
}
