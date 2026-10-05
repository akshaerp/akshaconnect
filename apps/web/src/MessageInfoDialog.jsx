import React, { useEffect, useState } from 'react';
import {
  listMessageReceipts,
} from './api.js';

async function fetchAll({
  token,
  conversationId,
  messageId,
  status,
}) {
  const rows = [];
  let offset = 0;
  let total = 0;

  for (
    let page = 0;
    page < 20;
    page += 1
  ) {
    const payload =
      await listMessageReceipts(
        token,
        conversationId,
        messageId,
        {
          status,
          limit: 100,
          offset,
        }
      );

    const pageRows =
      Array.isArray(
        payload?.receipts
      )
        ? payload.receipts
        : [];

    rows.push(...pageRows);

    total =
      Number(
        payload?.total ||
        rows.length
      );

    if (
      !payload?.page?.has_more ||
      pageRows.length === 0
    ) {
      break;
    }

    offset =
      Number(
        payload?.page
          ?.next_offset ||
        rows.length
      );
  }

  return {
    rows,
    total,
  };
}

function receiptTime(
  value,
  fallback
) {
  const parsed =
    new Date(value);

  if (
    Number.isNaN(
      parsed.getTime()
    )
  ) {
    return fallback;
  }

  return parsed.toLocaleString();
}

function ReceiptList({
  title,
  total,
  rows,
  empty,
  field,
  fallback,
}) {
  return (
    <section className="message-info-section">
      <header>
        <strong>{title}</strong>
        <span>{total}</span>
      </header>

      {rows.length ? (
        <div className="message-info-list">
          {rows.map(
            (row, index) => (
              <div
                className="message-info-row"
                key={
                  `${title}-${row.display_name || 'member'}-${row[field] || ''}-${index}`
                }
              >
                <span className="message-info-avatar">
                  {String(
                    row.display_name ||
                    'M'
                  )
                    .trim()
                    .slice(0, 1)
                    .toUpperCase()}
                </span>
                <span>
                  <strong>
                    {row.display_name ||
                      'Member'}
                  </strong>
                  <small>
                    {receiptTime(
                      row[field],
                      fallback
                    )}
                  </small>
                </span>
              </div>
            )
          )}
        </div>
      ) : (
        <p className="message-info-empty">
          {empty}
        </p>
      )}
    </section>
  );
}

export default function MessageInfoDialog({
  visible,
  token,
  conversationId,
  message,
  onClose,
}) {
  const [readers, setReaders] =
    useState([]);
  const [delivered, setDelivered] =
    useState([]);
  const [readTotal, setReadTotal] =
    useState(0);
  const [
    deliveredTotal,
    setDeliveredTotal,
  ] = useState(0);
  const [loading, setLoading] =
    useState(false);
  const [error, setError] =
    useState('');

  const messageId =
    message?.message_id || '';

  useEffect(() => {
    if (
      !visible ||
      !token ||
      !conversationId ||
      !messageId
    ) {
      return undefined;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');

      try {
        const [
          readResult,
          deliveredResult,
        ] = await Promise.all([
          fetchAll({
            token,
            conversationId,
            messageId,
            status: 'READ',
          }),
          fetchAll({
            token,
            conversationId,
            messageId,
            status: 'DELIVERED',
          }),
        ]);

        if (cancelled) return;

        setReaders(
          readResult.rows
        );
        setReadTotal(
          readResult.total
        );
        setDelivered(
          deliveredResult.rows
        );
        setDeliveredTotal(
          deliveredResult.total
        );
      } catch (requestError) {
        if (cancelled) return;

        setError(
          requestError?.message ||
          'Could not load message info'
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    const timer =
      window.setInterval(
        load,
        3000
      );

    return () => {
      cancelled = true;
      window.clearInterval(
        timer
      );
    };
  }, [
    visible,
    token,
    conversationId,
    messageId,
  ]);

  if (!visible) return null;

  return (
    <div
      className="message-info-overlay"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        className="message-info-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Message info"
        onMouseDown={
          (event) =>
            event.stopPropagation()
        }
      >
        <header className="message-info-header">
          <div>
            <strong>Message info</strong>
            <span>
              {readTotal} read · {deliveredTotal} delivered
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close message info"
          >
            ×
          </button>
        </header>

        <div className="message-info-preview">
          {String(
            message?.body_text ||
            (
              message?.message_type ===
              'ATTACHMENT'
                ? 'Attachment'
                : 'Message'
            )
          )}
        </div>

        {error ? (
          <div className="message-info-error">
            {error}
          </div>
        ) : null}

        {loading &&
        !readers.length &&
        !delivered.length ? (
          <div className="message-info-loading">
            Loading message info…
          </div>
        ) : (
          <>
            <ReceiptList
              title="Read by"
              total={readTotal}
              rows={readers}
              empty="No one has read this message yet."
              field="read_at"
              fallback="Read"
            />

            <ReceiptList
              title="Delivered to"
              total={deliveredTotal}
              rows={delivered}
              empty="No unread recipient delivery confirmations yet."
              field="delivered_at"
              fallback="Delivered"
            />

            <p className="message-info-note">
              Recipients move from Delivered to Read after their read receipt is recorded.
            </p>
          </>
        )}
      </section>
    </div>
  );
}
