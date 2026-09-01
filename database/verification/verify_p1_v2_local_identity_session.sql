-- P1-V2 LOCAL identity/session verification.
-- Run only in the standalone AkshaConnect database.

SELECT current_database() AS current_database;

WITH required_tables(table_name) AS (
    VALUES ('ac_local_credential'), ('ac_session')
)
SELECT
    COUNT(*) FILTER (WHERE to_regclass('public.' || table_name) IS NOT NULL) AS present_tables,
    COUNT(*) AS required_tables,
    CASE
        WHEN BOOL_AND(to_regclass('public.' || table_name) IS NOT NULL) THEN 'PASS'
        ELSE 'FAIL'
    END AS p1_v2_table_gate
FROM required_tables;

SELECT
    conname,
    pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conname IN (
    'uq_ac_workspace_member_identity_scope',
    'fk_ac_session_member_identity',
    'uq_ac_session_token_hash',
    'ck_ac_session_expiry'
)
ORDER BY conname;

SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
      'uq_ac_identity_provider_local_subject_ci',
      'ix_ac_session_active_member',
      'ix_ac_session_identity'
  )
ORDER BY indexname;

SELECT
    CASE
        WHEN EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'ac_session'
              AND column_name IN ('access_token', 'session_token', 'token')
        )
        THEN 'FAIL'
        ELSE 'PASS'
    END AS p1_v2_no_raw_session_token_gate;

SELECT
    CASE
        WHEN EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'ac_session'
              AND column_name = 'token_hash'
        )
        THEN 'PASS'
        ELSE 'FAIL'
    END AS p1_v2_token_hash_gate;
