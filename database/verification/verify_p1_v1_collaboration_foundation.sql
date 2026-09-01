-- P1-V1 collaboration foundation verification
-- Run after database/migrations/202609011610__p1_v1_collaboration_foundation.sql

WITH required_tables(table_name) AS (
    VALUES
        ('ac_workspace'),
        ('ac_identity'),
        ('ac_identity_provider_link'),
        ('ac_workspace_member'),
        ('ac_conversation'),
        ('ac_channel'),
        ('ac_channel_member'),
        ('ac_conversation_participant'),
        ('ac_system_sender'),
        ('ac_message'),
        ('ac_message_revision'),
        ('ac_read_cursor'),
        ('ac_event_receipt')
),
present AS (
    SELECT r.table_name,
           to_regclass('public.' || r.table_name) IS NOT NULL AS exists_flag
    FROM required_tables r
)
SELECT
    COUNT(*) FILTER (WHERE exists_flag) AS present_tables,
    COUNT(*) AS required_tables,
    CASE WHEN BOOL_AND(exists_flag) THEN 'PASS' ELSE 'FAIL' END AS p1_v1_table_gate
FROM present;

SELECT tc.table_name, COUNT(*) AS workspace_fk_count
FROM information_schema.table_constraints tc
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
 AND ccu.constraint_schema = tc.constraint_schema
WHERE tc.constraint_schema = 'public'
  AND tc.constraint_type = 'FOREIGN KEY'
  AND ccu.column_name = 'workspace_id'
  AND tc.table_name IN (
      'ac_workspace_member','ac_conversation','ac_channel','ac_channel_member',
      'ac_conversation_participant','ac_system_sender','ac_message',
      'ac_message_revision','ac_read_cursor','ac_event_receipt'
  )
GROUP BY tc.table_name
ORDER BY tc.table_name;

SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN ('uq_ac_message_client_id','ix_ac_message_history','ix_ac_event_receipt_status')
ORDER BY indexname;

SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conname IN (
    'ck_ac_message_sender',
    'uq_ac_event_receipt_provider_event',
    'fk_ac_message_conversation',
    'fk_ac_channel_member_member'
)
ORDER BY conname;

-- P1-V1 conversation-message integrity hardening.
SELECT
    conname,
    pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conname IN (
    'uq_ac_message_conversation_scope',
    'fk_ac_message_reply',
    'fk_ac_read_cursor_message'
)
ORDER BY conname;

WITH expected(conname, required_fragment) AS (
    VALUES
        ('fk_ac_message_reply',
         'FOREIGN KEY (workspace_id, conversation_id, reply_to_message_id) REFERENCES ac_message(workspace_id, conversation_id, message_id)'),
        ('fk_ac_read_cursor_message',
         'FOREIGN KEY (workspace_id, conversation_id, last_read_message_id) REFERENCES ac_message(workspace_id, conversation_id, message_id)')
),
actual AS (
    SELECT conname, pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE conname IN ('fk_ac_message_reply', 'fk_ac_read_cursor_message')
)
SELECT
    COUNT(*) FILTER (WHERE POSITION(expected.required_fragment IN actual.definition) > 0) AS passing_constraints,
    COUNT(*) AS required_constraints,
    CASE
        WHEN COUNT(*) FILTER (WHERE POSITION(expected.required_fragment IN actual.definition) > 0) = COUNT(*)
        THEN 'PASS'
        ELSE 'FAIL'
    END AS p1_v1_conversation_message_gate
FROM expected
LEFT JOIN actual USING (conname);
