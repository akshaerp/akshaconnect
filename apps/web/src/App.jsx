import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ApiError,
  createChannel,
  inspectSession,
  listChannels,
  listDirectMessages,
  listMembers,
  listMessages,
  listUnreadCounts,
  markRead,
  loginLocal,
  logout,
  sendMessage,
  startDirectMessage,
  uploadAttachment,
  downloadAttachment,
} from './api.js';
import {
  clearStoredSession,
  loadStoredSession,
  saveStoredSession,
} from './sessionStore.js';
import {
  createRealtimeClient,
  playIncomingMessageSound,
  unlockNotificationSound,
} from './realtime.js';

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

        <p className="login-footnote">P1-V6 realtime messaging web client</p>
      </section>
    </main>
  );
}

function SectionHeader({ title, actionLabel, onAction, unreadCount = 0 }) {
  return (
    <div className="section-header">
      <span className="section-header-title">
        {title}
        {unreadCount > 0 ? <span className="section-unread-total">{Math.min(99, unreadCount)}</span> : null}
      </span>
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

function makeClientMessageId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatMessageTime(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function messageDateKey(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return `${parsed.getFullYear()}-${parsed.getMonth()}-${parsed.getDate()}`;
}

function formatMessageDate(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const key = messageDateKey(value);
  if (key === messageDateKey(today)) return 'Today';
  if (key === messageDateKey(yesterday)) return 'Yesterday';
  return parsed.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: parsed.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  });
}

function sameMessageGroup(previous, current) {
  if (!previous || !current) return false;
  if (previous.sender_type !== current.sender_type) return false;
  if (previous.sender_member_id !== current.sender_member_id) return false;
  if (previous.system_sender_id !== current.system_sender_id) return false;
  if (messageDateKey(previous.created_at) !== messageDateKey(current.created_at)) return false;
  const previousTime = Date.parse(previous.created_at);
  const currentTime = Date.parse(current.created_at);
  return Number.isFinite(previousTime)
    && Number.isFinite(currentTime)
    && currentTime >= previousTime
    && currentTime - previousTime <= 5 * 60 * 1000;
}

function connectionLabel(status) {
  if (status === 'connected') return 'Connected';
  if (status === 'connecting') return 'Connecting…';
  if (status === 'reconnecting') return 'Reconnecting…';
  return 'Offline';
}

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_PENDING_ATTACHMENTS = 4;
const ACCEPTED_ATTACHMENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

function formatFileSize(value) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function attachmentIcon(contentType = '') {
  if (contentType.startsWith('image/')) return 'IMG';
  if (contentType === 'application/pdf') return 'PDF';
  if (contentType.includes('wordprocessingml')) return 'DOC';
  if (contentType.includes('spreadsheetml')) return 'XLS';
  if (contentType.includes('presentationml')) return 'PPT';
  return 'FILE';
}

function ConversationView({
  token,
  session,
  selected,
  onApiFailure,
  realtimeMessage,
  reconnectEpoch,
  realtimeStatus,
  onReadConversation,
  onViewportState,
  onOpenSidebar,
}) {
  const [messages, setMessages] = useState([]);
  const [page, setPage] = useState({ has_more: false, next_before_message_id: null });
  const [loading, setLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [pendingFiles, setPendingFiles] = useState([]);
  const [downloadingAttachmentId, setDownloadingAttachmentId] = useState('');
  const [unreadDividerMessageId, setUnreadDividerMessageId] = useState(null);
  const fileInputRef = useRef(null);
  const [showNewMessageJump, setShowNewMessageJump] = useState(false);
  const historyRef = useRef(null);
  const bottomRef = useRef(null);
  const nearBottomRef = useRef(true);
  const lastMarkedReadMessageIdRef = useRef(null);

  const reportViewportState = useCallback((atBottom) => {
    if (selected?.id) onViewportState?.(selected.id, Boolean(atBottom));
  }, [selected?.id, onViewportState]);

  const markMessageRead = useCallback((messageId) => {
    if (!messageId || !selected?.id || !token) return;
    if (lastMarkedReadMessageIdRef.current === messageId) return;
    lastMarkedReadMessageIdRef.current = messageId;
    markRead(token, selected.id, messageId)
      .then(() => onReadConversation?.(selected.id))
      .catch((requestError) => {
        if (lastMarkedReadMessageIdRef.current === messageId) {
          lastMarkedReadMessageIdRef.current = null;
        }
        onApiFailure(requestError);
      });
  }, [token, selected?.id, onApiFailure, onReadConversation]);

  const scrollToBottom = useCallback((behavior = 'smooth') => {
    bottomRef.current?.scrollIntoView({ behavior, block: 'end' });
    nearBottomRef.current = true;
    reportViewportState(true);
    setShowNewMessageJump(false);
  }, [reportViewportState]);

  const findUnreadDivider = useCallback((rows, unreadCount) => {
    let remaining = Number(unreadCount || 0);
    if (remaining <= 0) return null;
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      const item = rows[index];
      const own = item.sender_type === 'HUMAN'
        && item.sender_member_id === session.workspace_member_id;
      if (own) continue;
      remaining -= 1;
      if (remaining <= 0) return item.message_id;
    }
    return rows[0]?.message_id || null;
  }, [session.workspace_member_id]);

  const load = useCallback(async ({ before = '', appendOlder = false, manual = false, initialUnreadCount = null } = {}) => {
    if (!selected?.id || !token) return;
    if (appendOlder) setLoadingOlder(true);
    else if (manual) setRefreshing(true);
    else setLoading(true);
    setError('');

    try {
      const result = await listMessages(token, selected.id, { limit: 50, before });
      const nextMessages = result.messages || [];
      setMessages((current) => appendOlder ? [...nextMessages, ...current] : nextMessages);
      setPage(result.page || { has_more: false, next_before_message_id: null });

      if (!appendOlder) {
        const dividerId = initialUnreadCount === null
          ? null
          : findUnreadDivider(nextMessages, initialUnreadCount);
        if (initialUnreadCount !== null) setUnreadDividerMessageId(dividerId);
        window.requestAnimationFrame(() => {
          if (dividerId && historyRef.current) {
            const target = historyRef.current.querySelector(`[data-message-id="${dividerId}"]`);
            if (target) {
              target.scrollIntoView({ block: 'center' });
              nearBottomRef.current = false;
              reportViewportState(false);
              return;
            }
          }
          scrollToBottom('auto');
        });
      }

      const latest = nextMessages[nextMessages.length - 1];
      if (!appendOlder && latest?.message_id) {
        markMessageRead(latest.message_id);
      }
    } catch (requestError) {
      if (!onApiFailure(requestError)) {
        setError(requestError.message || 'Could not load messages');
      }
    } finally {
      setLoading(false);
      setLoadingOlder(false);
      setRefreshing(false);
    }
  }, [selected?.id, token, findUnreadDivider, markMessageRead, onApiFailure, reportViewportState, scrollToBottom]);

  useEffect(() => {
    setMessages([]);
    setPage({ has_more: false, next_before_message_id: null });
    setDraft('');
    setPendingFiles([]);
    setUnreadDividerMessageId(null);
    setShowNewMessageJump(false);
    lastMarkedReadMessageIdRef.current = null;
    nearBottomRef.current = true;
    reportViewportState(true);
    if (selected?.id) {
      load({ initialUnreadCount: Number(selected?.unread_at_open || 0) });
    }
  }, [selected?.id, selected?.unread_at_open, load, reportViewportState]);

  useEffect(() => {
    if (!selected?.id || reconnectEpoch <= 0) return;
    load();
  }, [reconnectEpoch, selected?.id, load]);

  useEffect(() => {
    const event = realtimeMessage;
    if (!event?.message || event.conversation_id !== selected?.id) return;

    const ownRealtimeMessage = event.message.sender_type === 'HUMAN'
      && event.message.sender_member_id === session.workspace_member_id;
    if (!ownRealtimeMessage) {
      setUnreadDividerMessageId((current) => current || event.message.message_id);
    }

    const shouldFollow = nearBottomRef.current;
    setMessages((current) => current.some((item) => item.message_id === event.message.message_id)
      ? current
      : [...current, event.message]);

    window.requestAnimationFrame(() => {
      if (shouldFollow) scrollToBottom('smooth');
      else setShowNewMessageJump(true);
    });

    const readableNow = document.visibilityState === 'visible' && nearBottomRef.current;
    if (readableNow && event.message.message_id) {
      markMessageRead(event.message.message_id);
    }
  }, [realtimeMessage, selected?.id, session.workspace_member_id, markMessageRead, scrollToBottom]);

  useEffect(() => {
    function reconcileVisibleRead() {
      if (document.visibilityState !== 'visible' || !nearBottomRef.current) return;
      const latest = messages[messages.length - 1];
      if (latest?.message_id) markMessageRead(latest.message_id);
    }

    document.addEventListener('visibilitychange', reconcileVisibleRead);
    window.addEventListener('focus', reconcileVisibleRead);
    return () => {
      document.removeEventListener('visibilitychange', reconcileVisibleRead);
      window.removeEventListener('focus', reconcileVisibleRead);
    };
  }, [messages, markMessageRead]);

  function handleHistoryScroll(event) {
    const element = event.currentTarget;
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    const wasNearBottom = nearBottomRef.current;
    const nowNearBottom = distance < 90;
    nearBottomRef.current = nowNearBottom;
    reportViewportState(nowNearBottom);
    if (nowNearBottom) {
      setShowNewMessageJump(false);
      if (!wasNearBottom) {
        const latest = messages[messages.length - 1];
        if (latest?.message_id) markMessageRead(latest.message_id);
      }
    }
  }

  function chooseAttachments(event) {
    const selectedFiles = Array.from(event.target.files || []);
    event.target.value = '';
    if (!selectedFiles.length) return;

    const next = [];
    for (const file of selectedFiles) {
      if (pendingFiles.length + next.length >= MAX_PENDING_ATTACHMENTS) break;
      if (!ACCEPTED_ATTACHMENT_TYPES.has(file.type)) {
        setError(`File type not allowed: ${file.name}`);
        continue;
      }
      if (!file.size || file.size > MAX_ATTACHMENT_BYTES) {
        setError(`File must be between 1 byte and 10 MB: ${file.name}`);
        continue;
      }
      next.push({
        file,
        clientMessageId: makeClientMessageId(),
      });
    }

    if (next.length) {
      setPendingFiles((current) => [...current, ...next]);
    }
  }

  function removePendingAttachment(clientMessageId) {
    if (sending) return;
    setPendingFiles((current) =>
      current.filter((item) => item.clientMessageId !== clientMessageId)
    );
  }

  async function handleDownloadAttachment(attachment) {
    if (!attachment?.attachment_id || !selected?.id || downloadingAttachmentId) return;
    setDownloadingAttachmentId(attachment.attachment_id);
    setError('');

    try {
      const blob = await downloadAttachment(
        token,
        selected.id,
        attachment.attachment_id
      );
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = href;
      anchor.download = attachment.file_name || 'attachment';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 1000);
    } catch (requestError) {
      if (!onApiFailure(requestError)) {
        setError(requestError.message || 'Could not download attachment');
      }
    } finally {
      setDownloadingAttachmentId('');
    }
  }

  async function submit(event) {
    event.preventDefault();
    const bodyText = draft.trim();
    if ((!bodyText && pendingFiles.length === 0) || sending || !selected?.id) return;
    setSending(true);
    setError('');

    try {
      const createdMessages = [];

      if (bodyText) {
        const result = await sendMessage(token, selected.id, {
          bodyText,
          clientMessageId: makeClientMessageId(),
        });
        if (result.message) createdMessages.push(result.message);
      }

      for (const pending of pendingFiles) {
        const result = await uploadAttachment(token, selected.id, pending);
        if (result.message) createdMessages.push(result.message);
      }

      setMessages((current) => {
        const next = [...current];
        for (const message of createdMessages) {
          if (!next.some((item) => item.message_id === message.message_id)) {
            next.push(message);
          }
        }
        next.sort((left, right) => {
          const byTime = Date.parse(left.created_at) - Date.parse(right.created_at);
          return byTime || String(left.message_id).localeCompare(String(right.message_id));
        });
        return next;
      });

      setDraft('');
      setPendingFiles([]);
      setUnreadDividerMessageId(null);
      window.requestAnimationFrame(() => scrollToBottom('smooth'));

      const latest = createdMessages[createdMessages.length - 1];
      if (latest?.message_id) markMessageRead(latest.message_id);
    } catch (requestError) {
      if (!onApiFailure(requestError)) {
        setError(requestError.message || 'Could not send message or attachment');
      }
    } finally {
      setSending(false);
    }
  }

  if (!selected) {
    return (
      <div className="conversation-empty">
        <button type="button" className="mobile-menu-button empty-menu-button" onClick={onOpenSidebar} aria-label="Open conversations">☰</button>
        <div className="empty-illustration" aria-hidden="true">AC</div>
        <h2>Choose a conversation</h2>
        <p>Select a channel or direct message from the sidebar.</p>
      </div>
    );
  }

  return (
    <>
      <header className="conversation-header">
        <div className="conversation-heading-row">
          <button type="button" className="mobile-menu-button" onClick={onOpenSidebar} aria-label="Open conversations">☰</button>
          <div>
            <div className="conversation-title">
              {selected.kind === 'channel' ? <span className="channel-symbol">#</span> : null}
              <h2>{selected.title}</h2>
            </div>
            <p>{selected.subtitle}</p>
          </div>
        </div>
        <div className="conversation-header-actions">
          <span className={`connection-pill connection-${realtimeStatus}`} role="status" aria-live="polite">
            <span className="connection-pill-dot" aria-hidden="true" />
            {connectionLabel(realtimeStatus)}
          </span>
          <button
            type="button"
            className="message-refresh-button compact-refresh-button"
            disabled={refreshing}
            onClick={() => load({ manual: true })}
            aria-label="Reload conversation"
            title="Reload conversation"
          >
            {refreshing ? '…' : '↻'}
          </button>
        </div>
      </header>

      {realtimeStatus !== 'connected' ? (
        <div className={`connection-banner connection-banner-${realtimeStatus}`} role="status">
          {realtimeStatus === 'reconnecting' || realtimeStatus === 'connecting'
            ? 'Realtime connection interrupted. Reconnecting automatically…'
            : 'Realtime connection is offline. Durable history will reconcile when the connection returns.'}
        </div>
      ) : null}

      <div
        className="conversation-body message-history"
        aria-live="polite"
        ref={historyRef}
        onScroll={handleHistoryScroll}
      >
        {page.has_more ? (
          <button
            type="button"
            className="load-older-button"
            disabled={loadingOlder}
            onClick={() => load({
              before: page.next_before_message_id,
              appendOlder: true,
            })}
          >
            {loadingOlder ? 'Loading…' : 'Load older messages'}
          </button>
        ) : null}

        {loading ? <div className="message-loading">Loading messages…</div> : null}

        {!loading && messages.length === 0 ? (
          <div className="welcome-message message-welcome">
            <div className="welcome-icon">{selected.kind === 'channel' ? '#' : initials(selected.title)}</div>
            <h3>{selected.kind === 'channel' ? `Welcome to #${selected.title}` : `Direct message with ${selected.title}`}</h3>
            <p>No messages yet. Start the conversation below.</p>
          </div>
        ) : null}

        <div className="message-list">
          {messages.map((message, index) => {
            const previous = messages[index - 1];
            const grouped = sameMessageGroup(previous, message);
            const showDate = !previous || messageDateKey(previous.created_at) !== messageDateKey(message.created_at);
            const own = message.sender_type === 'HUMAN' && message.sender_member_id === session.workspace_member_id;
            return (
              <React.Fragment key={message.message_id}>
                {showDate ? (
                  <div className="message-date-separator" role="separator">
                    <span>{formatMessageDate(message.created_at)}</span>
                  </div>
                ) : null}
                {message.message_id === unreadDividerMessageId ? (
                  <div className="new-messages-divider" role="separator">
                    <span>New messages</span>
                  </div>
                ) : null}
                <article
                  className={`message-row ${own ? 'own-message' : ''} ${grouped ? 'grouped-message' : ''}`}
                  data-message-id={message.message_id}
                >
                  {grouped ? (
                    <span className="message-avatar-spacer" aria-hidden="true">
                      <time>{formatMessageTime(message.created_at)}</time>
                    </span>
                  ) : (
                    <span className={`avatar message-avatar ${message.sender_type === 'SYSTEM' ? 'system-avatar' : ''}`}>
                      {message.sender_type === 'SYSTEM' ? 'S' : initials(message.sender_display_name)}
                    </span>
                  )}
                  <div className="message-copy">
                    {!grouped ? (
                      <div className="message-meta">
                        <strong>{message.sender_display_name || (message.sender_type === 'SYSTEM' ? 'System' : 'Unknown member')}</strong>
                        <time dateTime={message.created_at}>{formatMessageTime(message.created_at)}</time>
                        {message.sender_type === 'SYSTEM' ? <span className="system-message-badge">SYSTEM</span> : null}
                      </div>
                    ) : null}
                    {message.message_type !== 'ATTACHMENT' ? (
                      <div className="message-text">{message.body_text || ''}</div>
                    ) : null}
                    {Array.isArray(message.attachments) && message.attachments.length ? (
                      <div className="message-attachments">
                        {message.attachments.map((attachment) => (
                          <button
                            type="button"
                            className="attachment-card"
                            key={attachment.attachment_id}
                            onClick={() => handleDownloadAttachment(attachment)}
                            disabled={downloadingAttachmentId === attachment.attachment_id}
                            title={`Download ${attachment.file_name}`}
                          >
                            <span className="attachment-type-icon">
                              {attachmentIcon(attachment.content_type)}
                            </span>
                            <span className="attachment-card-copy">
                              <strong>{attachment.file_name}</strong>
                              <small>
                                {formatFileSize(attachment.size_bytes)}
                                {' · '}
                                {attachment.content_type}
                              </small>
                            </span>
                            <span className="attachment-download-action">
                              {downloadingAttachmentId === attachment.attachment_id
                                ? '…'
                                : '↓'}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </article>
              </React.Fragment>
            );
          })}
          <div ref={bottomRef} className="message-bottom-anchor" aria-hidden="true" />
        </div>

        {showNewMessageJump ? (
          <button type="button" className="new-message-jump" onClick={() => scrollToBottom('smooth')}>
            New messages ↓
          </button>
        ) : null}
      </div>

      <footer className="composer-shell">
        {error ? <div className="composer-error" role="alert">{error}</div> : null}
        <form className="composer-box active-composer" onSubmit={submit}>
          {pendingFiles.length ? (
            <div className="pending-attachments" aria-label="Attachments ready to send">
              {pendingFiles.map((pending) => (
                <div className="pending-attachment" key={pending.clientMessageId}>
                  <span className="attachment-type-icon">
                    {attachmentIcon(pending.file.type)}
                  </span>
                  <span className="pending-attachment-copy">
                    <strong>{pending.file.name}</strong>
                    <small>{formatFileSize(pending.file.size)}</small>
                  </span>
                  <button
                    type="button"
                    onClick={() => removePendingAttachment(pending.clientMessageId)}
                    disabled={sending}
                    aria-label={`Remove ${pending.file.name}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <textarea
            rows={2}
            aria-label="Message composer"
            value={draft}
            maxLength={8000}
            onChange={(event) => setDraft(event.target.value)}
            onInput={(event) => {
              event.currentTarget.style.height = 'auto';
              event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 180)}px`;
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                if (!sending && (draft.trim() || pendingFiles.length)) {
                  event.currentTarget.form?.requestSubmit();
                }
              }
            }}
            placeholder={`Message ${selected.kind === 'channel' ? `#${selected.title}` : selected.title}`}
          />

          <input
            ref={fileInputRef}
            className="attachment-file-input"
            type="file"
            multiple
            accept=".jpg,.jpeg,.png,.webp,.pdf,.txt,.csv,.docx,.xlsx,.pptx"
            onChange={chooseAttachments}
            tabIndex={-1}
            aria-hidden="true"
          />

          <div className="composer-actions">
            <div className="composer-left-actions">
              <button
                type="button"
                className="attach-button"
                onClick={() => fileInputRef.current?.click()}
                disabled={sending || pendingFiles.length >= MAX_PENDING_ATTACHMENTS}
                aria-label="Attach files"
                title="Attach files (up to 4 files, 10 MB each)"
              >
                ＋ File
              </button>
              <span>
                {draft.length >= 7000
                  ? `${draft.length.toLocaleString()} / 8,000 characters`
                  : pendingFiles.length
                    ? `${pendingFiles.length} attachment${pendingFiles.length === 1 ? '' : 's'} ready`
                    : 'Enter to send · Shift+Enter for new line'}
              </span>
            </div>
            <button
              type="submit"
              disabled={sending || (!draft.trim() && pendingFiles.length === 0)}
            >
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </form>
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
  const [unreadCounts, setUnreadCounts] = useState({});
  const [realtimeStatus, setRealtimeStatus] = useState('disconnected');
  const [realtimeMessage, setRealtimeMessage] = useState(null);
  const [reconnectEpoch, setReconnectEpoch] = useState(0);
  const [notificationToast, setNotificationToast] = useState(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const selectedRef = useRef(selected);
  const sessionRef = useRef(session);
  const navigationRef = useRef({ channels, directMessages });
  const conversationReadStateRef = useRef({ conversationId: null, atBottom: true });

  useEffect(() => { selectedRef.current = selected; }, [selected]);
  useEffect(() => { sessionRef.current = session; }, [session]);
  useEffect(() => { navigationRef.current = { channels, directMessages }; }, [channels, directMessages]);

  const totalUnread = useMemo(
    () => Object.values(unreadCounts).reduce((sum, value) => sum + Number(value || 0), 0),
    [unreadCounts]
  );
  const channelUnread = useMemo(
    () => channels.reduce((sum, channel) => sum + Number(unreadCounts[channel.conversation_id] || 0), 0),
    [channels, unreadCounts]
  );
  const dmUnread = useMemo(
    () => directMessages.reduce((sum, dm) => sum + Number(unreadCounts[dm.conversation_id] || 0), 0),
    [directMessages, unreadCounts]
  );

  useEffect(() => {
    document.title = totalUnread > 0 ? `(${Math.min(99, totalUnread)}) AkshaConnect` : 'AkshaConnect';
    return () => { document.title = 'AkshaConnect'; };
  }, [totalUnread]);

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key !== 'Escape') return;
      setMobileSidebarOpen(false);
      setShowChannelCreate(false);
      setShowDmPicker(false);
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, []);

  const clearSession = useCallback(() => {
    clearStoredSession();
    setToken('');
    setSession(null);
    setChannels([]);
    setDirectMessages([]);
    setSelected(null);
    setUnreadCounts({});
    setRealtimeMessage(null);
    setRealtimeStatus('disconnected');
    setNotificationToast(null);
    setMobileSidebarOpen(false);
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

  const refreshUnreadCounts = useCallback(async (activeToken) => {
    const payload = await listUnreadCounts(activeToken);
    const next = {};
    for (const item of payload.unread_counts || []) {
      next[item.conversation_id] = Number(item.unread_count || 0);
    }
    setUnreadCounts(next);
    return next;
  }, []);

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
        await Promise.all([
          refreshNavigation(token),
          refreshUnreadCounts(token),
        ]);
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
  }, [token, refreshNavigation, refreshUnreadCounts, handleApiFailure, clearSession]);

  useEffect(() => {
    if (!token || !session) return undefined;

    const unlock = () => unlockNotificationSound();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });

    const client = createRealtimeClient({
      token,
      onStatus: setRealtimeStatus,
      onEvent: (event) => {
        if (event.type === 'ready') {
          setReconnectEpoch((value) => value + 1);
          Promise.all([
            refreshNavigation(token),
            refreshUnreadCounts(token),
          ]).catch((error) => handleApiFailure(error));
          return;
        }

        if (event.type === 'read_cursor.updated') {
          setUnreadCounts((current) => ({ ...current, [event.conversation_id]: 0 }));
          return;
        }

        if (event.type !== 'message.created' || !event.message) return;

        setRealtimeMessage({ ...event, received_at: Date.now() });
        const currentSession = sessionRef.current;
        const ownMessage = event.message.sender_type === 'HUMAN'
          && event.message.sender_member_id === currentSession?.workspace_member_id;
        if (ownMessage) return;

        const currentSelection = selectedRef.current;
        const readState = conversationReadStateRef.current;
        const activeAndReadable = currentSelection?.id === event.conversation_id
          && document.visibilityState === 'visible'
          && readState.conversationId === event.conversation_id
          && readState.atBottom;

        if (!activeAndReadable) {
          setUnreadCounts((current) => ({
            ...current,
            [event.conversation_id]: Number(current[event.conversation_id] || 0) + 1,
          }));
        }

        playIncomingMessageSound();
        const nav = navigationRef.current;
        const channel = nav.channels.find((item) => item.conversation_id === event.conversation_id);
        const dm = nav.directMessages.find((item) => item.conversation_id === event.conversation_id);
        setNotificationToast({
          id: `${event.message.message_id}-${Date.now()}`,
          sender: event.message.sender_display_name || 'New message',
          conversation: channel?.channel_name ? `#${channel.channel_name}` : dm?.other_display_name || 'Conversation',
          preview: event.message.body_text || '',
          selection: channel ? {
            kind: 'channel',
            id: channel.conversation_id,
            title: channel.channel_name,
            subtitle: channel.visibility === 'PRIVATE' ? 'Private channel' : 'Public channel',
          } : dm ? {
            kind: 'dm',
            id: dm.conversation_id,
            title: dm.other_display_name,
            subtitle: dm.other_primary_email || 'Direct message',
          } : null,
        });
      },
    });

    return () => {
      client.stop();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [token, session, refreshNavigation, refreshUnreadCounts, handleApiFailure]);

  useEffect(() => {
    if (!notificationToast) return undefined;
    const timer = window.setTimeout(() => setNotificationToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [notificationToast]);

  const selectConversation = useCallback((next) => {
    const unreadAtOpen = next?.id ? Number(unreadCounts[next.id] || 0) : 0;
    conversationReadStateRef.current = { conversationId: next?.id || null, atBottom: unreadAtOpen <= 0 };
    setSelected(next ? { ...next, unread_at_open: unreadAtOpen } : null);
    setMobileSidebarOpen(false);
  }, [unreadCounts]);

  const handleConversationViewportState = useCallback((conversationId, atBottom) => {
    conversationReadStateRef.current = { conversationId, atBottom: Boolean(atBottom) };
  }, []);

  const handleReadConversation = useCallback((conversationId) => {
    if (!conversationId) return;
    setUnreadCounts((current) => ({ ...current, [conversationId]: 0 }));
  }, []);

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
    <div className={`app-shell ${mobileSidebarOpen ? 'mobile-sidebar-open' : ''}`}>
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
            <span className="workspace-connection-state" title={`Realtime: ${realtimeStatus}`}>
              <span className={`workspace-status-dot realtime-${realtimeStatus}`} />
              <span>{connectionLabel(realtimeStatus)}</span>
            </span>
          </div>
        </div>

        <nav className="workspace-nav" aria-label="Workspace conversations">
          <div className="nav-section">
            <SectionHeader
              title="Channels"
              unreadCount={channelUnread}
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
                    onClick={() => selectConversation({
                      kind: 'channel',
                      id: channel.conversation_id,
                      title: channel.channel_name,
                      subtitle: channel.visibility === 'PRIVATE' ? 'Private channel' : 'Public channel',
                    })}
                  >
                    <span className="nav-icon">#</span>
                    <span className="nav-label">{channel.channel_name}</span>
                    {Number(unreadCounts[channel.conversation_id] || 0) > 0 ? (
                      <span className="unread-badge">{Math.min(99, unreadCounts[channel.conversation_id])}</span>
                    ) : null}
                    {channel.visibility === 'PRIVATE' ? <span className="private-dot">•</span> : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="nav-section dm-section">
            <SectionHeader
              title="Direct messages"
              unreadCount={dmUnread}
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
                    onClick={() => selectConversation({
                      kind: 'dm',
                      id: dm.conversation_id,
                      title: dm.other_display_name,
                      subtitle: dm.other_primary_email || 'Direct message',
                    })}
                  >
                    <span className="avatar avatar-tiny">{initials(dm.other_display_name)}</span>
                    <span className="nav-label">{dm.other_display_name}</span>
                    {Number(unreadCounts[dm.conversation_id] || 0) > 0 ? (
                      <span className="unread-badge">{Math.min(99, unreadCounts[dm.conversation_id])}</span>
                    ) : null}
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

      {mobileSidebarOpen ? (
        <button
          type="button"
          className="mobile-sidebar-overlay"
          aria-label="Close conversations"
          onClick={() => setMobileSidebarOpen(false)}
        />
      ) : null}

      <main className="conversation-panel">
        {globalError ? <div className="global-banner in-app-banner">{globalError}</div> : null}
        <ConversationView
          token={token}
          session={session}
          selected={selected}
          onApiFailure={handleApiFailure}
          realtimeMessage={realtimeMessage}
          reconnectEpoch={reconnectEpoch}
          realtimeStatus={realtimeStatus}
          onReadConversation={handleReadConversation}
          onViewportState={handleConversationViewportState}
          onOpenSidebar={() => setMobileSidebarOpen(true)}
        />
      </main>

      {notificationToast ? (
        <button
          type="button"
          className="message-toast"
          onClick={() => {
            if (notificationToast.selection) selectConversation(notificationToast.selection);
            setNotificationToast(null);
          }}
          aria-label={`Open ${notificationToast.conversation}`}
        >
          <strong>{notificationToast.sender}</strong>
          <span>{notificationToast.conversation}</span>
          <small>{notificationToast.preview}</small>
        </button>
      ) : null}
    </div>
  );
}
