# AkshaConnect Mobile

Native React Native client for the standalone AkshaConnect product.

## P1-V8A V2 scope

The mobile application now supports the first complete durable messaging slice:

- native AkshaConnect login
- runtime-configurable AkshaConnect server origin
- LOCAL provider login
- workspace identity
- channel list
- direct-message list
- tap channel/DM to open a conversation
- latest 50 durable messages
- older-history pagination
- sender, timestamp, and date presentation
- text-message sending with client-message idempotency
- refresh
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

## Security boundary

The bearer token is still memory-only. Persistent sessions must later use
native secure credential storage; plaintext AsyncStorage is not allowed.

Message sender/workspace authority is never accepted from the mobile UI. The
server derives it from the verified bearer session.

## Deferred

Realtime WebSocket reconciliation, unread/read-cursor UX, attachments, secure
persisted login, device registration, push notifications, and offline queues
remain later P1-V8 checkpoints.
