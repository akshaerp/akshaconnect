# P1-V2 LOCAL Identity + Session Bootstrap

**Checkpoint:** P1-V2
**Base:** `cd011115934493cdc7bd5fe1275bb079609f5fcd`
**Version:** `0.8.0-phase1`

## Goal

Pure standalone AkshaConnect can authenticate a LOCAL user, establish a trusted workspace-scoped session, verify that session on later requests, and revoke it without contacting AkshaERP.

## Database boundary

The runtime connects only to the standalone AkshaConnect PostgreSQL database.

Startup executes:

```sql
SELECT current_database();
```

and compares it with `AKSHACONNECT_DATABASE_EXPECTED_NAME`. A mismatch fails startup before the API begins listening.

This prevents accidental use of an AkshaERP database during local development/deployment.

## Credential ownership

`ac_identity_provider_link` owns the LOCAL login subject.

`ac_local_credential` owns the password verifier for the AkshaConnect identity.

Passwords are never stored in plaintext. P1-V2 uses PostgreSQL `pgcrypto` password verification:

```text
password_hash = crypt(candidate_password, password_hash)
```

The DEV seed uses bcrypt-compatible Blowfish salts through `gen_salt('bf', 12)`.

## Session model

On successful login:

1. Node generates 32 random bytes.
2. The raw value becomes the bearer token returned to the client.
3. AkshaConnect stores only SHA-256(token) in `ac_session.token_hash`.
4. The session binds `workspace_id + workspace_member_id + identity_id`.
5. Every verification rechecks session expiry/revocation and active identity/workspace/membership state.

The raw token is not recoverable from the database.

## Trusted LOCAL context

LOCAL verified claims are provider-neutral:

```text
identity_id
workspace_id
workspace_member_id
session_id
identity_provider = LOCAL
```

They do not contain fake numeric ERP user/organization identifiers.

P0 external-provider claims remain temporarily supported for the AkshaERP adapter until the provider-context migration is completed.

## Fail-closed provider combination

P1-V2 rejects:

```text
IDENTITY_PROVIDER=LOCAL
BUSINESS_PROVIDER=AKSHAERP
```

because there is no reviewed mapping from an AkshaConnect LOCAL identity to an authoritative AkshaERP actor yet.

## HTTP endpoints

```text
POST /api/v1/auth/local/login
GET  /api/v1/auth/session
POST /api/v1/auth/logout
```

Invalid workspace/login/password/account state deliberately returns the same generic `LOCAL_AUTH_INVALID` response.

## Deferred

P1-V2 does not yet implement:

- password reset/recovery
- MFA
- refresh tokens
- device administration
- production login rate limiter outside credential lockout
- channel/DM authorization APIs
- web login screen

Those are subsequent checkpoints.
