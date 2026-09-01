-- DEV/TEST ONLY. Do not run in production.
-- Requires P1-V1 DEV_ALPHA/DEV_BETA identities and P1-V2 migration.
--
-- Test-only password for all three seeded accounts:
-- AkshaConnect-Dev-Only-2026!
--
-- Login names:
-- DEV_ALPHA / dev-alice
-- DEV_ALPHA / dev-bob
-- DEV_BETA  / dev-carol

BEGIN;

INSERT INTO ac_local_credential (
    identity_id,
    password_hash,
    credential_status,
    failed_attempts,
    locked_until,
    password_changed_at,
    updated_at
)
SELECT
    identity_id,
    crypt('AkshaConnect-Dev-Only-2026!', gen_salt('bf', 12)),
    'ACTIVE',
    0,
    NULL,
    NOW(),
    NOW()
FROM ac_identity
WHERE identity_id IN (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc3'
)
ON CONFLICT (identity_id) DO UPDATE
SET
    password_hash = EXCLUDED.password_hash,
    credential_status = 'ACTIVE',
    failed_attempts = 0,
    locked_until = NULL,
    password_changed_at = NOW(),
    updated_at = NOW();

COMMIT;
