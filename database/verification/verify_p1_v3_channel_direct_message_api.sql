-- P1-V3 channel/direct-message verification.
-- Run only in the standalone AkshaConnect database.

SELECT current_database() AS current_database;

SELECT
    CASE
        WHEN to_regclass('public.ac_direct_message') IS NOT NULL THEN 'PASS'
        ELSE 'FAIL'
    END AS p1_v3_direct_message_table_gate;

SELECT
    conname,
    pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conname IN (
    'uq_ac_conversation_type_scope',
    'pk_ac_direct_message',
    'uq_ac_direct_message_conversation',
    'fk_ac_direct_message_conversation',
    'fk_ac_direct_message_member_a',
    'fk_ac_direct_message_member_b',
    'ck_ac_direct_message_type',
    'ck_ac_direct_message_distinct_members',
    'ck_ac_direct_message_canonical_pair'
)
ORDER BY conname;

SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
      'uq_ac_channel_code_ci',
      'ix_ac_direct_message_member_b'
  )
ORDER BY indexname;

SELECT
    CASE
        WHEN EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'pk_ac_direct_message'
              AND pg_get_constraintdef(oid) LIKE '%workspace_id%member_a_id%member_b_id%'
        )
        THEN 'PASS'
        ELSE 'FAIL'
    END AS p1_v3_unique_dm_pair_gate;

SELECT
    CASE
        WHEN EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'fk_ac_direct_message_conversation'
              AND pg_get_constraintdef(oid) LIKE '%conversation_type%'
        )
        THEN 'PASS'
        ELSE 'FAIL'
    END AS p1_v3_dm_type_fk_gate;

SELECT
    CASE
        WHEN EXISTS (
            SELECT 1
            FROM pg_indexes
            WHERE schemaname = 'public'
              AND indexname = 'uq_ac_channel_code_ci'
              AND indexdef ILIKE '%lower%channel_code%'
        )
        THEN 'PASS'
        ELSE 'FAIL'
    END AS p1_v3_channel_code_ci_gate;
