# P1-V2 Acceptance

## Automated gate

```powershell
npm install
npm run verify
```

P1-V2 must prove:

- LOCAL login issues an opaque token
- only the token hash is passed to persistence
- invalid login errors do not disclose account state
- failed passwords increment the credential failure path
- verified LOCAL claims contain workspace/identity/member UUIDs
- inactive identity/workspace/member sessions fail closed
- logout revokes by token hash
- LOCAL user search cannot override trusted workspace scope
- LOCAL + AKSHAERP business is rejected until actor mapping exists
- HTTP auth routes do not echo passwords
- SQL contains no raw access/session token column

## Database gate

Run in the standalone `akshaconnect` database:

1. `database/migrations/202609011820__p1_v2_local_identity_session.sql`
2. `database/verification/verify_p1_v2_local_identity_session.sql`

Expected:

```text
present_tables = 2
required_tables = 2
p1_v2_table_gate = PASS

p1_v2_no_raw_session_token_gate = PASS
p1_v2_token_hash_gate = PASS
```

Then, for DEV/TEST only:

`database/seeds/202609011830__p1_v2_dev_local_credentials.sql`

## Live API gate

Start the API with LOCAL/NONE mode and an `AKSHACONNECT_DATABASE_URL` that points to the standalone `akshaconnect` database.

Test identities:

```text
DEV_ALPHA / dev-alice
DEV_ALPHA / dev-bob
DEV_BETA  / dev-carol
```

DEV-only password from the seed:

```text
AkshaConnect-Dev-Only-2026!
```

Verify:

1. Alice logs into DEV_ALPHA.
2. Session endpoint returns Alice + DEV_ALPHA trusted claims.
3. Alice using DEV_BETA returns generic invalid credentials.
4. Wrong password returns generic invalid credentials.
5. Logout succeeds.
6. Reusing the logged-out token returns `LOCAL_SESSION_INVALID`.
7. No AkshaERP URL/API client/API key is required in LOCAL/NONE mode.

Do not commit/push until automated, database, and live API gates are reviewed.
