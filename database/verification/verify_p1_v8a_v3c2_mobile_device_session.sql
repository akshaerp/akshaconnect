-- P1-V8A V3C2 mobile device-session verification.
-- Run only in the standalone AkshaConnect database.

SELECT
    CASE
        WHEN to_regclass(
            'public.ac_device_session'
        ) IS NOT NULL
        THEN 'PASS'
        ELSE 'FAIL'
    END AS device_session_table_gate;

SELECT
    conname,
    pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conname IN (
    'uq_ac_device_session_token_hash',
    'fk_ac_device_session_member_identity',
    'ck_ac_device_session_platform',
    'ck_ac_device_session_expiry',
    'ck_ac_device_session_revocation'
)
ORDER BY conname;

SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
      'ix_ac_device_session_active_identity',
      'ix_ac_device_session_active_member'
  )
ORDER BY indexname;

SELECT
    CASE
        WHEN EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'ac_device_session'
              AND column_name IN (
                  'device_token',
                  'refresh_token',
                  'raw_token'
              )
        )
        THEN 'FAIL'
        ELSE 'PASS'
    END AS no_raw_device_token_gate;

SELECT
    CASE
        WHEN EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'ac_device_session'
              AND column_name = 'device_token_hash'
        )
        THEN 'PASS'
        ELSE 'FAIL'
    END AS device_token_hash_gate;
