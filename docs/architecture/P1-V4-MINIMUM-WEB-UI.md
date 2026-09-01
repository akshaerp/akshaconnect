# P1-V4 Minimum Functional Web UI

**Checkpoint:** P1-V4
**Base:** `2a51eb866d56d1fda68677268e4c8ee0ee8560f5`
**Version:** `0.10.0-phase1`

## Goal

Create the first standalone AkshaConnect React client so P1-V2 identity/session and P1-V3 channel/direct-message APIs can be exercised as a real user rather than only through scripts.

## Product boundary

The web client is an AkshaConnect product surface. It consumes only AkshaConnect HTTP contracts and does not know provider-specific module codes, function codes, tables, role implementations, or database identifiers.

The web client does not query PostgreSQL directly.

## Runtime

`apps/web` is a Vite + React application.

Development ports:

```text
AkshaConnect API  http://127.0.0.1:4100
AkshaConnect Web  http://127.0.0.1:4173
```

Vite proxies `/api`, `/health`, and `/ready` to the API. The browser therefore calls same-origin relative paths during local development and the API does not need a development-only CORS relaxation.

## Session model

The LOCAL bearer token is kept in browser `sessionStorage`, not `localStorage`. Closing the browser tab/session removes the browser copy. The server remains authoritative for session expiry and revocation.

The password is never persisted by the client.

On refresh, the web client calls `GET /api/v1/auth/session` before trusting the stored bearer token.

## Minimum surface

P1-V4 includes:

- LOCAL workspace login
- session restore
- workspace identity/profile shell
- channel list
- create PUBLIC/PRIVATE channel
- direct-message list
- workspace-member discovery
- start/reuse a direct message
- selected conversation header/body shell
- composer shell
- logout

## Messaging boundary

P1-V4 must not invent message persistence ahead of the server contract.

The composer is deliberately disabled and clearly states that messaging activates in P1-V5. There is no client call to a message-send endpoint in this checkpoint.

## Browser acceptance

Use two browser sessions (normal + private/incognito is sufficient):

```text
Session A: DEV_ALPHA / dev-alice
Session B: DEV_ALPHA / dev-bob
```

Both users must see the same workspace-scoped channels and the canonical Alice/Bob DM established by P1-V3. Creating a channel or starting a DM in the UI must use the real P1-V3 endpoints.

## Exit criteria

- root `npm install` installs the web workspace dependencies and updates the lockfile
- `npm run verify` includes a successful production web build
- web source contains no provider-specific ERP implementation contract
- LOCAL login works through the UI
- refresh restores a valid session
- channel list/create works through the UI
- direct-message list/start works through the UI
- workspace member discovery remains tenant-scoped
- logout clears client session and revokes the server session
- composer is visible but cannot send before P1-V5
