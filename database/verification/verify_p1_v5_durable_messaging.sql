-- P1-V5 durable messaging verification.
-- Run only in the standalone AkshaConnect database after the P1-V5 migration.

SELECT current_database() AS current_database;

SELECT
    CASE WHEN to_regclass('public.ac_message') IS NOT NULL THEN 'PASS' ELSE 'FAIL' END
        AS p1_v5_message_table_gate,
    CASE WHEN to_regclass('public.ac_read_cursor') IS NOT NULL THEN 'PASS' ELSE 'FAIL' END
        AS p1_v5_read_cursor_table_gate,
    CASE WHEN to_regclass('public.ac_system_sender') IS NOT NULL THEN 'PASS' ELSE 'FAIL' END
        AS p1_v5_system_sender_table_gate;

SELECT
    conname,
    pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conname IN (
    'ck_ac_message_sender',
    'fk_ac_message_conversation',
    'fk_ac_message_human_sender',
    'fk_ac_message_system_sender',
    'fk_ac_message_reply',
    'fk_ac_read_cursor_message'
)
ORDER BY conname;

SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
      'uq_ac_message_client_id',
      'ix_ac_message_history',
      'uq_ac_message_system_source_event',
      'ix_ac_read_cursor_member_activity',
      'ix_ac_message_human_sender_history'
  )
ORDER BY indexname;

SELECT CASE
    WHEN EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = 'uq_ac_message_client_id'
          AND indexdef ILIKE '%workspace_id%conversation_id%client_message_id%'
    ) THEN 'PASS' ELSE 'FAIL' END AS p1_v5_human_idempotency_gate;

SELECT CASE
    WHEN EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = 'uq_ac_message_system_source_event'
          AND indexdef ILIKE '%system_sender_id%source_event_id%'
          AND indexdef ILIKE '%sender_type%SYSTEM%'
    ) THEN 'PASS' ELSE 'FAIL' END AS p1_v5_system_idempotency_gate;

SELECT CASE
    WHEN EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_ac_message_reply'
          AND pg_get_constraintdef(oid) LIKE '%conversation_id%reply_to_message_id%'
    ) THEN 'PASS' ELSE 'FAIL' END AS p1_v5_same_conversation_reply_gate;

SELECT CASE
    WHEN EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_ac_read_cursor_message'
          AND pg_get_constraintdef(oid) LIKE '%conversation_id%last_read_message_id%'
    ) THEN 'PASS' ELSE 'FAIL' END AS p1_v5_same_conversation_cursor_gate;
