# P1-V8A V1 — Native Mobile Foundation

## Status

Accepted on Android using a physical Redmi Note 9 Pro.

## Proven path

```text
Native Android UI
→ AkshaConnect mobile API client
→ LOCAL authentication
→ bearer session
→ workspace isolation
→ channel/direct-message navigation data
→ standalone AkshaConnect PostgreSQL database
```

## Scope delivered

- React Native 0.87 Android/iOS source foundation
- native AkshaConnect branding
- runtime-configurable server origin
- LOCAL login
- workspace/member identity
- channel inventory
- direct-message inventory
- refresh
- logout
- memory-only bearer token

The mobile client is provider-neutral and does not expose AkshaERP module codes,
function codes, database tables, role models, or ERP security implementation
details.

## Deferred intentionally

- durable conversation screen
- text-message sending
- realtime WebSocket
- attachments
- secure persistent session
- push/device registration
- offline queue
- Windows target

P1-V8A V2 begins with durable channel/DM message history and text-message send.
