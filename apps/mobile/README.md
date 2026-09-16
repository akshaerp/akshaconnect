# AkshaConnect Mobile

Native React Native client for the standalone AkshaConnect product.

## P1-V8A V1 accepted scope

P1-V8A V1 establishes the real Android/iOS application foundation and has been
practically accepted on Android against the standalone LOCAL provider.

Current V1 functionality:

- AkshaConnect native login screen
- runtime-configurable AkshaConnect server origin
- LOCAL provider login
- authenticated workspace identity
- channel list
- direct-message list
- pull-to-refresh
- logout
- bearer token held in memory only

The mobile client consumes AkshaConnect provider-neutral contracts. It contains
no AkshaERP module codes, function codes, database tables, role model, or ERP
security implementation details.

## Local Android development

Use the AkshaConnect-specific Node/JDK environment, then start Metro from this
directory:

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

Then use this server origin in the app:

```text
http://127.0.0.1:4100
```

A central HTTPS AkshaConnect server can be entered directly without rebuilding
the mobile application.

## Security boundary

V1 does not persist the bearer token. Persistent sessions must use native secure
credential storage in a later P1-V8 checkpoint; plaintext AsyncStorage/session
storage is not allowed for the bearer token.

## Next checkpoint

P1-V8A V2 adds durable channel/direct-message history and text-message sending.
Realtime WebSocket reconciliation, attachments, secure persisted login, device
registration, and push notifications remain later checkpoints.
