# P1-V8A V2 — Durable Mobile Messaging

## Goal

Make the native Android/iOS client useful for its first real collaboration task:
open an existing channel or DM, read durable history, and send a text message.

## Existing contracts reused

V2 reuses the established provider-neutral endpoints:

```text
GET  /api/v1/conversations/:conversationId/messages
POST /api/v1/conversations/:conversationId/messages
```

The server already:

- authorizes conversation access from verified session claims
- bounds history pages
- decrypts message body text only in application memory
- derives workspace and human sender authority from trusted claims
- provides client-message idempotency
- persists encrypted message bodies
- publishes durable-message realtime events for later V3 consumption

## Native V2 UX

- channel and DM rows are tappable
- conversation header has Back and Refresh
- latest 50 messages load on open
- older pages can be loaded explicitly
- history is chronological
- Today / Yesterday / date separators are shown
- own human messages are visually distinct
- system messages are presented separately
- attachment messages are identified but attachment interaction remains deferred
- composer supports up to the existing 8000-character server limit
- send uses a generated mobile client message id
- successful sends append the authoritative server-returned message

## Explicitly deferred

V2 does not claim realtime presence or delivery/read receipts. WebSocket
reconciliation, unread/read cursor handling, attachments, native secure
persistent sessions, device registration, and push notifications remain later
P1-V8 work.
