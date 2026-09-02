# P1-V6 Realtime Messaging

**Checkpoint:** P1-V6

**Base Git checkpoint:** `8acfc13288e4033041e02188860df280b956124c`

**Version:** `0.12.0-phase1`

## Objective

Add authenticated single-node realtime delivery to the secure durable P1-V5/P1-V5A messaging foundation without weakening persistence, tenant isolation, provider neutrality, or encryption-at-rest.

P1-V6 treats realtime as an acceleration layer. PostgreSQL remains authoritative. If a socket disconnects or an event is missed, the client reconciles durable history and unread state after reconnect.

## Transport

The standalone API exposes WebSocket upgrades on `/ws`.

Browser WebSocket APIs cannot set an HTTP `Authorization` header. P1-V6 therefore deliberately avoids query-string bearer tokens. The connection is upgraded without identity authority and the first client frame must be:

```json
{
  "type": "auth",
  "access_token": "<opaque AkshaConnect session token>"
}
```

The gateway validates the token through the existing LOCAL identity service. Until that succeeds, the connection has no workspace/member authority. Invalid or missing authentication fails closed.

## Events

Server to client:

```text
ready
message.created
read_cursor.updated
```

`message.created` contains the same authorized application message envelope returned by the durable HTTP API. Message content is decrypted only inside the API process and transported to an authorized connected member. The database continues to store ciphertext only.

## Recipient authorization

Realtime fan-out does not trust client subscriptions. For each durable message event the server resolves eligible recipients from AkshaConnect-owned collaboration data:

- PUBLIC channel: active workspace members
- PRIVATE channel: active channel members
- DM/GROUP_DM: active conversation participants

A socket receives an event only when its verified workspace/member claims match the resolved recipient set.

## Unread state

`GET /api/v1/unread-counts` derives unread counts from:

- authorized accessible conversations
- durable `ac_read_cursor`
- durable message ordering
- messages sent by someone other than the current human member (SystemSender messages still count)

The web client increments counts immediately for background realtime events and reconciles from the server at startup/reconnect. Opening/reading a conversation advances the existing durable cursor and clears the local badge.

## Browser UX

P1-V6 adds:

- message appears without Refresh when the socket is connected
- unread badge per channel/DM
- incoming-message sound
- in-app notification toast
- realtime connection status indicator
- automatic reconnect with bounded exponential retry
- durable history/unread reconciliation after reconnect
- message-id deduplication in the active conversation

An outgoing message from the same member never triggers the incoming notification sound.

## Failure model

Durable persistence happens before event publication. Realtime event/listener failure must never turn a committed message into an HTTP send failure.

P1-V6 uses an in-process event bus and single-node WebSocket gateway. Horizontal multi-instance fan-out (for example Redis/NATS) is intentionally a later scaling checkpoint; the core event contract is kept provider-neutral so the transport can be replaced without changing collaboration contracts.

## Security boundary

P1-V6 does not add AkshaERP module codes, function codes, tables, security mappings, or ERP-specific identifiers to the collaboration core. AkshaERP remains an optional provider/connector.

The websocket bearer token is never placed in the URL. Production deployment must terminate TLS so browser WebSocket traffic uses `wss://`.
