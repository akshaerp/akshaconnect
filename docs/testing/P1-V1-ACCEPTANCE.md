# P1-V1 Acceptance

## Automated gate

Run:

```powershell
Set-Location "D:\PROJECTS\akshaconnect"
npm run verify
```

P1-V1 adds static architecture tests that verify the required collaboration tables, provider neutrality, composite workspace isolation, human/system sender integrity, and idempotency structures.

## PostgreSQL gate

Run in DBeaver, against the standalone AkshaConnect PostgreSQL database:

1. `database/migrations/202609011610__p1_v1_collaboration_foundation.sql`
2. `database/migrations/202609011700__p1_v1_conversation_message_integrity.sql`
3. `database/verification/verify_p1_v1_collaboration_foundation.sql`

The first verification result must report all required tables present.

The optional seed file is:

`database/seeds/202609011620__p1_v1_dev_seed.sql`

It is DEV/TEST ONLY and creates two isolated workspaces for later API/UI testing.

## No commit until both gates are reviewed

The apply package modifies only the local standalone repository and does not commit or push.
