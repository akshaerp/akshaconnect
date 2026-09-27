import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  downloadAttachment,
  listThread,
  sendMessage,
  uploadAttachment,
} from './api.js';
import './threadPanel.css';

const MAX_PENDING_ATTACHMENTS = 4;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'AC';
}

function formatMessageTime(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatFileSize(value) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function makeClientMessageId() {
  return `web-thread-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function mergeById(rows) {
  const map = new Map();
  for (const row of rows || []) {
    if (row?.message_id) map.set(row.message_id, row);
  }
  return [...map.values()].sort((a, b) => {
    const byTime = Date.parse(a.created_at || '') - Date.parse(b.created_at || '');
    return byTime || String(a.message_id).localeCompare(String(b.message_id));
  });
}

function ThreadMessage({
  message,
  token,
  conversationId,
  currentMemberId,
  onApiFailure,
}) {
  const deleted = Boolean(message.deleted_at);
  const own =
    message.sender_type === 'HUMAN' &&
    message.sender_member_id === currentMemberId;

  async function download(attachment) {
    try {
      const blob = await downloadAttachment(token, conversationId, attachment.attachment_id);
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = href;
      anchor.download = attachment.file_name || 'attachment';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 1000);
    } catch (error) {
      onApiFailure?.(error);
    }
  }

  return (
    <article
      className={`thread-message ${own ? 'thread-message-own' : 'thread-message-other'}`}
      data-thread-message-id={message.message_id}
    >
      {!own ? (
        <span className="thread-avatar">
          {initials(message.sender_display_name || 'Member')}
        </span>
      ) : null}

      <div className={`thread-message-bubble ${own ? 'thread-bubble-own' : 'thread-bubble-other'}`}>
        <div className="thread-message-meta">
          <strong>{own ? 'You' : message.sender_display_name || 'Member'}</strong>
          <time dateTime={message.created_at}>{formatMessageTime(message.created_at)}</time>
          {message.edited_at && !deleted ? <span>edited</span> : null}
        </div>

        {deleted ? (
          <div className="thread-deleted">Message deleted</div>
        ) : message.message_type !== 'ATTACHMENT' ? (
          <div className="thread-message-body">{message.body_text || ''}</div>
        ) : null}

        {!deleted && Array.isArray(message.attachments) && message.attachments.length ? (
          <div className="thread-attachments">
            {message.attachments.map((attachment) => (
              <button
                key={attachment.attachment_id}
                type="button"
                className={`thread-attachment ${own ? 'thread-attachment-own' : ''}`}
                onClick={() => download(attachment)}
              >
                <strong>{attachment.file_name}</strong>
                <span>{formatFileSize(attachment.size_bytes)} · Download</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

export default function ThreadPanel({
  token,
  session,
  conversation,
  parentMessage,
  realtimeMessage,
  onClose,
  onApiFailure,
  onThreadActivity,
}) {
  const [parent, setParent] = useState(parentMessage);
  const [replies, setReplies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [pendingFiles, setPendingFiles] = useState([]);
  const fileInputRef = useRef(null);
  const bottomRef = useRef(null);

  const parentId = parentMessage?.message_id || '';
  const conversationId = conversation?.id || '';
  const currentMemberId = session?.workspace_member_id || '';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setParent(parentMessage);
    setReplies([]);
    setDraft('');
    setPendingFiles([]);

    if (!token || !conversationId || !parentId) return undefined;

    listThread(token, conversationId, parentId)
      .then((result) => {
        if (cancelled) return;
        setParent(result.parent || parentMessage);
        setReplies(result.replies || []);
        const latest = (result.replies || []).at(-1);
        if (latest?.message_id) onThreadActivity?.(latest.message_id);
      })
      .catch((requestError) => {
        if (cancelled) return;
        if (!onApiFailure?.(requestError)) {
          setError(requestError.message || 'Could not load thread');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [token, conversationId, parentId, parentMessage, onApiFailure, onThreadActivity]);

  useEffect(() => {
    const event = realtimeMessage;
    if (!event?.message || event.conversation_id !== conversationId) return;
    const message = event.message;

    if (message.message_id === parentId) {
      setParent(message);
      return;
    }

    if (message.reply_to_message_id !== parentId) return;

    if (event.type === 'message.created') {
      setReplies((current) => mergeById([...current, message]));
      onThreadActivity?.(message.message_id);
      window.requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }));
      return;
    }

    if (event.type === 'message.updated' || event.type === 'message.deleted') {
      setReplies((current) => current.map((item) => item.message_id === message.message_id ? message : item));
    }
  }, [realtimeMessage, conversationId, parentId, onThreadActivity]);

  const title = useMemo(() => {
    const count = replies.length;
    return count ? `Thread · ${count} ${count === 1 ? 'reply' : 'replies'}` : 'Thread';
  }, [replies.length]);

  function chooseFiles(event) {
    const selected = Array.from(event.target.files || []);
    event.target.value = '';
    if (!selected.length) return;

    setError('');
    setPendingFiles((current) => {
      const next = [...current];
      for (const file of selected) {
        if (next.length >= MAX_PENDING_ATTACHMENTS) break;
        if (!file.size || file.size > MAX_ATTACHMENT_BYTES) {
          setError(`${file.name} must be 10 MB or smaller`);
          continue;
        }
        next.push({ file, clientMessageId: makeClientMessageId() });
      }
      return next;
    });
  }

  async function submit(event) {
    event.preventDefault();
    const bodyText = draft.trim();
    if (sending || (!bodyText && pendingFiles.length === 0)) return;
    setSending(true);
    setError('');

    try {
      const created = [];
      if (bodyText) {
        const result = await sendMessage(token, conversationId, {
          bodyText,
          clientMessageId: makeClientMessageId(),
          replyToMessageId: parentId,
        });
        if (result.message) created.push(result.message);
        setDraft('');
      }

      for (const pending of pendingFiles) {
        const result = await uploadAttachment(token, conversationId, {
          ...pending,
          replyToMessageId: parentId,
        });
        if (result.message) created.push(result.message);
      }

      if (created.length) {
        setReplies((current) => mergeById([...current, ...created]));
        onThreadActivity?.(created.at(-1)?.message_id);
      }
      setPendingFiles([]);
      window.requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }));
    } catch (requestError) {
      if (!onApiFailure?.(requestError)) {
        setError(requestError.message || 'Could not send thread reply');
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <aside className="thread-panel" aria-label="Message thread">
      <header className="thread-header">
        <div><strong>{title}</strong><span>{conversation?.title || ''}</span></div>
        <button type="button" onClick={onClose} aria-label="Close thread">×</button>
      </header>

      <div className="thread-history">
        {parent ? (
          <ThreadMessage
            message={parent}
            token={token}
            conversationId={conversationId}
            currentMemberId={currentMemberId}
            onApiFailure={onApiFailure}
          />
        ) : null}
        <div className="thread-separator"><span>Replies</span></div>
        {loading ? <div className="thread-state">Loading replies…</div> : null}
        {!loading && replies.length === 0 ? <div className="thread-state">No replies yet.</div> : null}
        {replies.map((message) => (
          <ThreadMessage
            key={message.message_id}
            message={message}
            token={token}
            conversationId={conversationId}
            currentMemberId={currentMemberId}
            onApiFailure={onApiFailure}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      <footer className="thread-composer">
        {error ? <div className="thread-error" role="alert">{error}</div> : null}
        {pendingFiles.length ? (
          <div className="thread-pending-files">
            {pendingFiles.map((pending) => (
              <span key={pending.clientMessageId}>{pending.file.name}<button type="button" onClick={() => setPendingFiles((rows) => rows.filter((row) => row.clientMessageId !== pending.clientMessageId))}>×</button></span>
            ))}
          </div>
        ) : null}
        <form onSubmit={submit}>
          <textarea
            rows={3}
            maxLength={8000}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                if (!sending && (draft.trim() || pendingFiles.length)) event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Reply in thread"
            aria-label="Reply in thread"
          />
          <input ref={fileInputRef} type="file" multiple className="attachment-file-input" onChange={chooseFiles} tabIndex={-1} aria-hidden="true" />
          <div className="thread-composer-actions">
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={sending || pendingFiles.length >= MAX_PENDING_ATTACHMENTS}>＋ File</button>
            <button type="submit" disabled={sending || (!draft.trim() && pendingFiles.length === 0)}>{sending ? 'Sending…' : 'Reply'}</button>
          </div>
        </form>
      </footer>
    </aside>
  );
}
