# AkshaConnect

AkshaConnect is an independent enterprise collaboration product with web/mobile clients and pluggable identity/business providers. AkshaERP is a native integration, not a mandatory runtime dependency.

The repository is currently in **Phase 1: standalone minimum viable application**.

## Current checkpoint — P1-V5A

Version: `0.11.1-phase1`

P1-V1 established standalone collaboration persistence and tenant/workspace isolation. P1-V2 added LOCAL identity/session runtime. P1-V3 added workspace member discovery plus create/list channel and direct-message APIs. P1-V4 added the first standalone React web client.

P1-V5 activates durable messaging:

- authenticated human message send with sender derived from the verified session
- durable message history from `ac_message`
- cursor-based older-message pagination
- client-message idempotency with conflict detection
- same-conversation reply protection
- monotonic read-cursor advancement
- trusted internal SystemSender persistence with source-event idempotency
- active web composer and manual cross-browser Refresh

P1-V5A hardens P1-V5 before commit by encrypting all stored message/revision bodies with application-level AES-256-GCM and physically removing plaintext body columns. It is encryption at rest, not E2EE.

P1-V5/P1-V5A intentionally do not add WebSocket/EventSource delivery. Realtime fan-out remains P1-V6.

## Pure standalone mode

```text
AKSHACONNECT_IDENTITY_PROVIDER=LOCAL
AKSHACONNECT_BUSINESS_PROVIDER=NONE
```

AkshaConnect uses its own PostgreSQL database. It must not directly query, join, reference, or create foreign keys into an AkshaERP database.

## Local runtime configuration

Set these values locally; do not commit real credentials:

```text
AKSHACONNECT_DATABASE_URL=postgresql://<user>:<password>@127.0.0.1:5432/akshaconnect
AKSHACONNECT_DATABASE_EXPECTED_NAME=akshaconnect
AKSHACONNECT_LOCAL_SESSION_TTL_SECONDS=28800
AKSHACONNECT_MESSAGE_ENCRYPTION_KEY_ID=<non-secret-key-id>
AKSHACONNECT_MESSAGE_ENCRYPTION_KEY_B64=<base64-encoded-32-byte-secret>
```

## Local development

Install once from the repository root:

```text
npm install
```

Run the API in terminal 1:

```text
npm run start:api
```

Run the web client in terminal 2:

```text
npm run start:web
```

Open:

```text
http://127.0.0.1:4173
```

The Vite development server proxies AkshaConnect API paths to port `4100`.

## Local auth endpoints

```text
POST /api/v1/auth/local/login
GET  /api/v1/auth/session
POST /api/v1/auth/logout
```

## Collaboration endpoints

```text
GET  /api/v1/workspace/members?query=<text>&limit=<n>
GET  /api/v1/channels
POST /api/v1/channels
GET  /api/v1/direct-messages
POST /api/v1/direct-messages
```

Workspace scope is always taken from the verified session. Caller-supplied workspace IDs are not authoritative.

## Messaging endpoints

All routes require the AkshaConnect bearer session:

```text
GET  /api/v1/conversations/:conversationId/messages?limit=50&before=<messageId>
POST /api/v1/conversations/:conversationId/messages
GET  /api/v1/conversations/:conversationId/read-cursor
PUT  /api/v1/conversations/:conversationId/read-cursor
```

The human send route accepts `body_text`, `client_message_id`, and an optional `reply_to_message_id`. Workspace and human sender are derived only from the verified session. SystemSender persistence is an internal trusted service boundary; P1-V5 does not expose a public SystemSender HTTP route.

## Provider modes

Pure standalone:

```text
AKSHACONNECT_IDENTITY_PROVIDER=LOCAL
AKSHACONNECT_BUSINESS_PROVIDER=NONE
```

AkshaERP integrated:

```text
AKSHACONNECT_IDENTITY_PROVIDER=AKSHAERP
AKSHACONNECT_BUSINESS_PROVIDER=AKSHAERP
```

Mixed identity-only integration:

```text
AKSHACONNECT_IDENTITY_PROVIDER=AKSHAERP
AKSHACONNECT_BUSINESS_PROVIDER=NONE
```

`LOCAL` identity with `AKSHAERP` business provider remains intentionally rejected until a trusted local-to-ERP actor mapping exists.

## Requirements

- Node.js 20 or newer
- npm 10 or newer recommended
- PostgreSQL 16 recommended for the standalone database

## Verify locally

```text
npm install
npm run verify
```

Expected health payload includes:

```json
{
  "status": "ok",
  "service": "akshaconnect-api",
  "phase": "1",
  "checkpoint": "P1-V5A",
  "version": "0.11.1-phase1"
}
```

## Architecture boundary

AkshaConnect owns collaboration identity/session/data and standalone collaboration UX. Provider-specific IDs remain provider data; collaboration identity is represented by AkshaConnect UUIDs.

Read:

- `docs/architecture/P0-V6D-GENERIC-BUSINESS-BOUNDARY.md`
- `docs/architecture/P1-V1-COLLABORATION-PERSISTENCE.md`
- `docs/architecture/P1-V1-PHASE1-EXECUTION-PLAN.md`
- `docs/architecture/P1-V2-LOCAL-IDENTITY-SESSION.md`
- `docs/architecture/P1-V3-CHANNEL-DIRECT-MESSAGE-API.md`
- `docs/architecture/P1-V4-MINIMUM-WEB-UI.md`
- `docs/architecture/P1-V5-DURABLE-MESSAGING.md`
- `docs/architecture/P1-V5A-MESSAGE-ENCRYPTION-AT-REST.md`
