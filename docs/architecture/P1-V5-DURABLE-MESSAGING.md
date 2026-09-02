# P1-V5 Durable Messaging

**Checkpoint:** P1-V5
**Base:** `aa72447c07b050fd264bb42bb4ebca81c20ac4ca`
**Version:** `0.11.0-phase1`

## Goal

Turn the P1-V4 conversation shell into a durable standalone messaging surface without introducing realtime transport before P1-V6.

## Human message authority

The browser submits only message content, an opaque `client_message_id`, and an optional reply target. The server derives workspace and sender member exclusively from the verified LOCAL session.

Caller fields such as `workspace_id`, `sender_type`, `sender_member_id`, and `system_sender_id` are never authoritative for the human HTTP route.

## Conversation authorization

Message history, send, and read-cursor operations are workspace-scoped and require an active requester.

- PUBLIC CHANNEL: any active workspace member may read/send in P1-V5.
- PRIVATE CHANNEL: current channel membership is required.
- DM/GROUP_DM: current conversation participation is required.

This matches the P1-V3 discovery model while keeping private conversations fail-closed.

## Idempotency

Human messages use the existing P1-V1 unique boundary:

```text
(workspace_id, conversation_id, client_message_id)
```

The same client id with the same sender/content/reply target returns the existing message. Reusing that id for different semantics returns `409 MESSAGE_IDEMPOTENCY_CONFLICT`.

Trusted SystemSender events use:

```text
(workspace_id, conversation_id, system_sender_id, source_event_id)
```

and fail closed on semantic conflicts.

## History pagination

The API returns the newest page ordered chronologically for rendering. `before=<messageId>` requests the next older page using the durable tuple `(created_at, message_id)`.

Limits are 1..100, default 50. Invalid/foreign cursors return a stable boundary error.

## Read cursor

`ac_read_cursor` remains one row per workspace/conversation/member. The P1-V5 repository only advances the cursor to an equal-or-newer message and never intentionally moves it backward.

The existing P1-V1 hardening foreign key guarantees `last_read_message_id` belongs to the same conversation.

## SystemSender

SystemSender persistence exists only through `publishTrustedSystemMessage()` in P1-V5. It requires trusted in-process authority and is not exposed as a public browser HTTP endpoint.

Future JBM/provider adapters can compose this boundary after their own authentication/authorization without changing message ownership.

## Web behavior

The P1-V4 disabled composer becomes active. Selecting a conversation loads durable history. Sending inserts a durable message and updates the local view. A manual Refresh action allows the second browser to load newly persisted messages before P1-V6 realtime fan-out exists.

## Exit criteria

- P1-V5 migration and SQL verification pass in `akshaconnect`
- human sender is derived only from verified claims
- private/DM access fails closed
- send survives browser/API restart because `ac_message` is authoritative
- duplicate client message id is idempotent, conflicting reuse is rejected
- history pagination is stable
- read cursor remains conversation-scoped and monotonic
- trusted SystemSender source events are idempotent
- browser composer sends and history renders
- two browsers can exchange messages by manual Refresh
- no WebSocket/EventSource implementation appears before P1-V6
- full repository verification and production web build pass

## P1-V5A storage hardening

Before P1-V5 is committed, P1-V5A replaces plaintext database message/revision bodies with application-level AES-256-GCM storage. The HTTP contract remains `body_text`; plaintext exists only in authorized application memory. See `P1-V5A-MESSAGE-ENCRYPTION-AT-REST.md`.
