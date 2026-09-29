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
const THREAD_COMPOSER_EMOJIS = ['😀','😃','😄','😁','😂','😊','😍','👍','👏','🙏','🎉','✅','❤️','🔥','👀','🤝'];

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
  parent = false,
}) {
  const deleted = Boolean(message.deleted_at);
  const own = message.sender_type === 'HUMAN'
    && message.sender_member_id === currentMemberId;
  const displayName = own
    ? 'You'
    : message.sender_display_name || (message.sender_type === 'SYSTEM' ? 'System' : 'Member');

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
      className={`thread-message ${own ? 'thread-message-own' : 'thread-message-other'} ${parent ? 'thread-parent-message' : ''}`}
      data-thread-message-id={message.message_id}
    >
      {!own ? (
        <span className={`thread-avatar ${message.sender_type === 'SYSTEM' ? 'thread-avatar-system' : ''}`}>
          {message.sender_type === 'SYSTEM' ? 'S' : initials(message.sender_display_name || 'Member')}
        </span>
      ) : null}

      <div className="thread-message-cluster">
        <div className="thread-message-meta">
          <strong>{displayName}</strong>
          <time dateTime={message.created_at}>{formatMessageTime(message.created_at)}</time>
          {message.edited_at && !deleted ? <span>edited</span> : null}
        </div>

        <div className="thread-message-bubble">
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
                  className="thread-attachment"
                  onClick={() => download(attachment)}
                >
                  <strong>{attachment.file_name}</strong>
                  <span>{formatFileSize(attachment.size_bytes)} · Download</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {own ? (
        <span className="thread-avatar thread-avatar-own">
          {initials(message.sender_display_name || 'You')}
        </span>
      ) : null}
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
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const fileInputRef = useRef(null);
  const bottomRef = useRef(null);
  const onApiFailureRef = useRef(onApiFailure);
  const onThreadActivityRef = useRef(onThreadActivity);

  useEffect(() => {
    onApiFailureRef.current = onApiFailure;
    onThreadActivityRef.current = onThreadActivity;
  }, [onApiFailure, onThreadActivity]);

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
    setShowEmojiPicker(false);

    if (!token || !conversationId || !parentId) return undefined;

    listThread(token, conversationId, parentId)
      .then((result) => {
        if (cancelled) return;
        setParent(result.parent || parentMessage);
        setReplies(result.replies || []);
        const latest = (result.replies || []).at(-1);
        if (latest?.message_id) onThreadActivityRef.current?.(latest.message_id);
      })
      .catch((requestError) => {
        if (cancelled) return;
        if (!onApiFailureRef.current?.(requestError)) {
          setError(requestError.message || 'Could not load thread');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [token, conversationId, parentId]);

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
      onThreadActivityRef.current?.(message.message_id);
      window.requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }));
      return;
    }

    if (event.type === 'message.updated' || event.type === 'message.deleted') {
      setReplies((current) => current.map((item) => item.message_id === message.message_id ? message : item));
    }
  }, [realtimeMessage, conversationId, parentId]);

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

  function insertEmoji(emoji) {
    const next = `${draft}${emoji}`.slice(0, 8000);
    setDraft(next);
    setShowEmojiPicker(false);
  }

  async function submit(event) {
    event.preventDefault();
    const bodyText = draft.trim();
    if (sending || (!bodyText && pendingFiles.length === 0)) return;
    setSending(true);
    setError('');
    setShowEmojiPicker(false);

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
        onThreadActivityRef.current?.(created.at(-1)?.message_id);
      }
      setPendingFiles([]);
      window.requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }));
    } catch (requestError) {
      if (!onApiFailureRef.current?.(requestError)) {
        setError(requestError.message || 'Could not send thread reply');
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <aside className="thread-panel" aria-label="Message thread">
      <header className="thread-header">
        <div>
          <strong>{title}</strong>
          <span>{conversation?.title || ''}</span>
        </div>
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
            parent
          />
        ) : null}

        <div className="thread-separator">
          <span>{replies.length ? `${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}` : 'Replies'}</span>
        </div>

        {loading ? <div className="thread-state">Loading replies…</div> : null}
        {!loading && replies.length === 0 ? <div className="thread-state">No replies yet.</div> : null}

        <div className="thread-replies" aria-live="polite">
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
        </div>

        <div ref={bottomRef} className="thread-bottom-anchor" aria-hidden="true" />
      </div>

      <footer className="thread-composer">
        {error ? <div className="thread-error" role="alert">{error}</div> : null}

        {pendingFiles.length ? (
          <div className="thread-pending-files">
            {pendingFiles.map((pending) => (
              <span key={pending.clientMessageId}>
                {pending.file.name}
                <button
                  type="button"
                  onClick={() => setPendingFiles((rows) => rows.filter((row) => row.clientMessageId !== pending.clientMessageId))}
                  aria-label={`Remove ${pending.file.name}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : null}

        <form className="thread-composer-box" onSubmit={submit}>
          <textarea
            rows={3}
            maxLength={8000}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                if (!sending && (draft.trim() || pendingFiles.length)) {
                  event.currentTarget.form?.requestSubmit();
                }
              }
            }}
            placeholder="Reply in thread"
            aria-label="Reply in thread"
          />

          {showEmojiPicker ? (
            <div className="thread-emoji-picker" role="group" aria-label="Thread emoji picker">
              {THREAD_COMPOSER_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => insertEmoji(emoji)}
                  aria-label={`Insert ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          ) : null}

          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="attachment-file-input"
            onChange={chooseFiles}
            tabIndex={-1}
            aria-hidden="true"
          />

          <div className="thread-composer-actions">
            <div className="thread-composer-tools">
              <button
                type="button"
                className="thread-composer-tool"
                onClick={() => setShowEmojiPicker((value) => !value)}
                disabled={sending}
              >
                😊 Emoji
              </button>
              <button
                type="button"
                className="thread-composer-tool"
                onClick={() => fileInputRef.current?.click()}
                disabled={sending || pendingFiles.length >= MAX_PENDING_ATTACHMENTS}
              >
                ＋ File
              </button>
            </div>

            <span className="thread-composer-hint">Enter to send · Shift+Enter for new line</span>

            <button
              type="submit"
              className="thread-send-button"
              disabled={sending || (!draft.trim() && pendingFiles.length === 0)}
            >
              {sending ? 'Sending…' : 'Reply'}
            </button>
          </div>
        </form>
      </footer>
    </aside>
  );
}
