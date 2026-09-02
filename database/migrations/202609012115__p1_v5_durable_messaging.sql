BEGIN;

-- Human message idempotency already exists from P1-V1 through
-- uq_ac_message_client_id(workspace_id, conversation_id, client_message_id).
-- P1-V5 adds the equivalent durable idempotency boundary for trusted
-- SystemSender events and indexes the read-cursor access pattern.

CREATE UNIQUE INDEX uq_ac_message_system_source_event
    ON ac_message (
        workspace_id,
        conversation_id,
        system_sender_id,
        source_event_id
    )
    WHERE sender_type = 'SYSTEM'
      AND source_event_id IS NOT NULL;

CREATE INDEX ix_ac_read_cursor_member_activity
    ON ac_read_cursor(workspace_id, workspace_member_id, read_at DESC);

CREATE INDEX ix_ac_message_human_sender_history
    ON ac_message(workspace_id, sender_member_id, created_at DESC, message_id)
    WHERE sender_type = 'HUMAN';

COMMIT;
