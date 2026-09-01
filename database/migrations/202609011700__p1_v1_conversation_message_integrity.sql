BEGIN;

-- A reply must point to a message in the same workspace AND the same conversation.
-- A read cursor must point to a message in the same workspace AND the same conversation.

ALTER TABLE ac_message
    ADD CONSTRAINT uq_ac_message_conversation_scope
    UNIQUE (workspace_id, conversation_id, message_id);

ALTER TABLE ac_message
    DROP CONSTRAINT fk_ac_message_reply;

ALTER TABLE ac_message
    ADD CONSTRAINT fk_ac_message_reply
    FOREIGN KEY (workspace_id, conversation_id, reply_to_message_id)
    REFERENCES ac_message(workspace_id, conversation_id, message_id)
    ON DELETE SET NULL (reply_to_message_id);

DROP INDEX IF EXISTS ix_ac_message_reply;

CREATE INDEX ix_ac_message_reply
    ON ac_message(workspace_id, conversation_id, reply_to_message_id)
    WHERE reply_to_message_id IS NOT NULL;

ALTER TABLE ac_read_cursor
    DROP CONSTRAINT fk_ac_read_cursor_message;

ALTER TABLE ac_read_cursor
    ADD CONSTRAINT fk_ac_read_cursor_message
    FOREIGN KEY (workspace_id, conversation_id, last_read_message_id)
    REFERENCES ac_message(workspace_id, conversation_id, message_id)
    ON DELETE SET NULL (last_read_message_id);

COMMIT;
