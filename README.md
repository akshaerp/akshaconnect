\
# AkshaConnect

AkshaConnect is an independent enterprise collaboration product with web/mobile clients and pluggable identity/business providers. AkshaERP is a native integration, not a mandatory runtime dependency.

The repository is currently in **Phase 1: standalone minimum viable application**.

## Current checkpoint — P1-V7

Version: `0.13.0-phase1`

P1-V1 established standalone collaboration persistence and tenant/workspace isolation. P1-V2 added LOCAL identity/session runtime. P1-V3 added workspace member discovery plus create/list channel and direct-message APIs. P1-V4 added the first standalone React web client.

P1-V5 activates durable messaging:

- authenticated human message send with sender derived from the verified session
- durable message history from `ac_message`
- cursor-based older-message pagination
- client-message idempotency with conflict detection
- same-conversation reply protection
- monotonic read-cursor advancement
- trusted internal SystemSender persistence with source-event idempotency
- active web composer

P1-V5A hardens P1-V5 by encrypting all stored message/revision bodies with application-level AES-256-GCM and physically removing plaintext body columns. It is encryption at rest, not E2EE.

P1-V6 adds authenticated WebSocket fan-out, reconnect recovery, unread-count reconciliation, realtime read-cursor propagation, incoming-message sound, and in-app notification toasts. The browser never places the bearer token in the WebSocket URL; authentication occurs in the first frame after upgrade. Realtime remains an acceleration layer over durable encrypted storage, so missed events are recovered from PostgreSQL after reconnect.

P1-V7 hardens the web UX and adds durable basic attachments:

- responsive desktop/mobile navigation
- explicit connected/reconnecting/offline state
- grouped messages and date separators
- unread totals, deterministic New Messages dividers and smart scroll behavior
- click-through notification toasts
- growing composer with keyboard behavior
- durable `ATTACHMENT` messages
- authenticated upload/download through conversation scope
- AES-256-GCM encrypted attachment bytes before local storage
- SHA-256 attachment integrity verification
- opaque UUID storage keys
- no plaintext attachment filename/file bytes in `ac_attachment`

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
AKSHACONNECT_ATTACHMENT_LOCAL_DIR=<directory-outside-git-repository>
```

For local attachment development, the configured attachment directory must remain outside the Git repository.

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

The Vite development server proxies AkshaConnect API and WebSocket paths to port `4100`.

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
POST /api/v1/conversations/:conversationId/attachments
GET  /api/v1/conversations/:conversationId/attachments/:attachmentId/content
GET  /api/v1/conversations/:conversationId/read-cursor
PUT  /api/v1/conversations/:conversationId/read-cursor
GET  /api/v1/unread-counts
```

The human text-send route accepts `body_text`, `client_message_id`, and an optional `reply_to_message_id`. Workspace and human sender are derived only from the verified session. Attachment routes use the same authenticated conversation-access boundary. SystemSender persistence is an internal trusted service boundary. `/ws` is the realtime transport; the first client frame must authenticate with the existing AkshaConnect bearer session.

## Attachment limits for P1-V7

- maximum 10 MB per attachment
- up to four files selected per composer send
- JPEG, PNG, WebP, PDF, TXT, CSV, DOCX, XLSX and PPTX
- encrypted object bytes stored outside PostgreSQL
- metadata and encryption material stored in `ac_attachment`
- production malware scanning/object-storage hardening remains a later gate

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
  "checkpoint": "P1-V7",
  "version": "0.13.0-phase1"
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
- `docs/architecture/P1-V6-REALTIME-MESSAGING.md`
- `docs/architecture/P1-V7-WEB-UX-HARDENING.md`
