# AkshaConnect

AkshaConnect is an independent enterprise collaboration product with web/mobile clients and pluggable identity/business providers. AkshaERP is a native integration, not a mandatory runtime dependency.

The repository is currently in **Phase 1: standalone minimum viable application**.

## Current checkpoint — P1-V3

Version: `0.9.0-phase1`

P1-V1 established the standalone collaboration PostgreSQL model and tenant/workspace isolation.

P1-V2 added AkshaConnect-owned LOCAL identity/session runtime with workspace-scoped login, opaque bearer sessions, SHA-256-only token persistence, expiry/revocation, and fail-closed standalone database verification.

P1-V3 adds the first collaboration discovery/creation APIs:

- workspace member discovery for DM targeting
- create/list channels
- PUBLIC channel discovery and membership-bound PRIVATE channel listing
- canonical one-conversation-per-pair direct messages
- start/list direct messages
- cross-workspace DM target rejection
- case-insensitive channel-code uniqueness per workspace
- transactional channel/DM creation

P1-V3 intentionally does not add message send/history. Durable messaging remains P1-V5.

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
```

The API refuses startup if `current_database()` does not match `AKSHACONNECT_DATABASE_EXPECTED_NAME`.

## Local auth endpoints

```text
POST /api/v1/auth/local/login
GET  /api/v1/auth/session
POST /api/v1/auth/logout
```

Login body:

```json
{
  "workspace_code": "DEV_ALPHA",
  "login_name": "dev-alice",
  "password": "<local password>"
}
```

A successful login returns an opaque bearer token. The raw token is never stored in PostgreSQL.

## P1-V3 collaboration endpoints

All routes below require the P1-V2 bearer token:

```text
GET  /api/v1/workspace/members?query=<text>&limit=<n>
GET  /api/v1/channels
POST /api/v1/channels
GET  /api/v1/direct-messages
POST /api/v1/direct-messages
```

Create channel body:

```json
{
  "channel_name": "Engineering",
  "channel_code": "engineering",
  "visibility": "PUBLIC"
}
```

`channel_code` is optional; when omitted it is normalized from the channel name.

Start direct message body:

```json
{
  "target_workspace_member_id": "<member UUID>"
}
```

Workspace scope is always taken from the verified session. Caller-supplied workspace IDs are not authoritative.

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
- Docker optional

## Verify locally

```bash
npm install
npm run verify
npm run start:api
```

Expected health payload includes:

```json
{
  "status": "ok",
  "service": "akshaconnect-api",
  "phase": "1",
  "checkpoint": "P1-V3",
  "version": "0.9.0-phase1"
}
```

## Architecture boundary

AkshaConnect owns collaboration identity/session/data in standalone mode. Provider-specific IDs remain provider data; collaboration identity is represented by AkshaConnect UUIDs.

Read:

- `docs/architecture/P0-V6D-GENERIC-BUSINESS-BOUNDARY.md`
- `docs/architecture/P1-V1-COLLABORATION-PERSISTENCE.md`
- `docs/architecture/P1-V1-PHASE1-EXECUTION-PLAN.md`
- `docs/architecture/P1-V2-LOCAL-IDENTITY-SESSION.md`
- `docs/architecture/P1-V3-CHANNEL-DIRECT-MESSAGE-API.md`
