# AkshaConnect

AkshaConnect is an independent enterprise collaboration product with web/mobile clients and pluggable identity/business providers. AkshaERP is a native integration, not a mandatory runtime dependency.

The repository is currently in **Phase 1: standalone minimum viable application**.

## Current checkpoint — P1-V2

Version: `0.8.0-phase1`

P1-V1 established the standalone collaboration PostgreSQL model and tenant/workspace isolation.

P1-V2 adds the first AkshaConnect-owned LOCAL identity/session runtime:

- workspace-scoped local login
- password verification through PostgreSQL `pgcrypto`
- opaque bearer session tokens
- only SHA-256 token hashes are persisted
- session expiry and revocation
- active workspace/member/identity validation on every session lookup
- provider-neutral trusted request context for LOCAL identities
- fail-closed database-name verification before the API listens
- AkshaERP identity/business provider behavior remains isolated behind adapters

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

`LOCAL` identity with `AKSHAERP` business provider is intentionally rejected in P1-V2 because no trusted local-to-ERP actor mapping exists yet.

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
  "checkpoint": "P1-V2",
  "version": "0.8.0-phase1"
}
```

## Architecture boundary

AkshaConnect owns collaboration identity/session state in LOCAL mode. Provider-specific IDs remain provider data; collaboration identity is represented by AkshaConnect UUIDs.

Read:

- `docs/architecture/P0-V6D-GENERIC-BUSINESS-BOUNDARY.md`
- `docs/architecture/P1-V1-COLLABORATION-PERSISTENCE.md`
- `docs/architecture/P1-V1-PHASE1-EXECUTION-PLAN.md`
- `docs/architecture/P1-V2-LOCAL-IDENTITY-SESSION.md`
