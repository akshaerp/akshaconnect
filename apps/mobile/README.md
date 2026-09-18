# AkshaConnect Mobile

Native React Native client for the standalone AkshaConnect product.

## P1-V8A V3 scope

The mobile application now supports durable messaging plus authenticated
realtime delivery:

- native AkshaConnect login
- runtime-configurable AkshaConnect server origin
- LOCAL provider login
- workspace identity
- channel list
- direct-message list
- durable conversation history
- older-history pagination
- text-message sending with client-message idempotency
- authenticated WebSocket connection to `/ws`
- bearer token sent only in the first WebSocket frame
- live `message.created` delivery
- duplicate suppression by durable `message_id`
- reconnect with bounded exponential backoff
- durable history reconciliation after reconnect
- Android/iOS application lifecycle reconnect
- visible Live / Connecting / Reconnecting / Offline state
- manual refresh retained as a recovery/testing action
- back navigation
- logout

The mobile client consumes AkshaConnect provider-neutral contracts. It contains
no AkshaERP module codes, function codes, database tables, role model, or ERP
security implementation details.

## Local Android development

Start Metro from `apps/mobile`:

```text
npm start
```

For a USB-connected Android device:

```text
adb reverse tcp:8081 tcp:8081
```

If the standalone API runs locally on port 4100:

```text
adb reverse tcp:4100 tcp:4100
```

Use this server origin in the app:

```text
http://127.0.0.1:4100
```

The realtime client derives:

```text
ws://127.0.0.1:4100/ws
```

from the configured HTTP server origin.

## Security boundary

The bearer token is still memory-only. Persistent sessions must later use
native secure credential storage; plaintext AsyncStorage is not allowed.

The bearer token is never placed in the WebSocket URL. It is sent only in the
first WebSocket frame after transport establishment, matching the existing
AkshaConnect realtime gateway contract.

Message sender/workspace authority is never accepted from the mobile UI. The
server derives it from the verified bearer session.

## Durable reconciliation

Realtime is an acceleration path, not the source of truth. Durable PostgreSQL
message history remains authoritative. When the socket reconnects, the open
conversation reloads the latest durable page and merges it by `message_id`.
This closes gaps caused by mobile backgrounding, network loss, or socket
reconnects.

## Deferred

Unread/read-cursor UX, notification sound, attachments, secure persisted login,
device registration, push notifications, and offline send queues remain later
P1-V8 checkpoints.
