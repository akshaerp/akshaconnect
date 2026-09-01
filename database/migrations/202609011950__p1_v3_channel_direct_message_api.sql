BEGIN;

CREATE UNIQUE INDEX uq_ac_channel_code_ci
    ON ac_channel (workspace_id, LOWER(channel_code));

ALTER TABLE ac_conversation
    ADD CONSTRAINT uq_ac_conversation_type_scope
    UNIQUE (workspace_id, conversation_id, conversation_type);

CREATE TABLE ac_direct_message (
    workspace_id UUID NOT NULL,
    conversation_id UUID NOT NULL,
    conversation_type VARCHAR(20) NOT NULL DEFAULT 'DM',
    member_a_id UUID NOT NULL,
    member_b_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT pk_ac_direct_message
        PRIMARY KEY (workspace_id, member_a_id, member_b_id),
    CONSTRAINT uq_ac_direct_message_conversation
        UNIQUE (workspace_id, conversation_id),
    CONSTRAINT fk_ac_direct_message_conversation
        FOREIGN KEY (workspace_id, conversation_id, conversation_type)
        REFERENCES ac_conversation(workspace_id, conversation_id, conversation_type)
        ON DELETE CASCADE,
    CONSTRAINT fk_ac_direct_message_member_a
        FOREIGN KEY (workspace_id, member_a_id)
        REFERENCES ac_workspace_member(workspace_id, workspace_member_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_ac_direct_message_member_b
        FOREIGN KEY (workspace_id, member_b_id)
        REFERENCES ac_workspace_member(workspace_id, workspace_member_id)
        ON DELETE CASCADE,
    CONSTRAINT ck_ac_direct_message_type
        CHECK (conversation_type = 'DM'),
    CONSTRAINT ck_ac_direct_message_distinct_members
        CHECK (member_a_id <> member_b_id),
    CONSTRAINT ck_ac_direct_message_canonical_pair
        CHECK (member_a_id < member_b_id)
);

CREATE INDEX ix_ac_direct_message_member_b
    ON ac_direct_message(workspace_id, member_b_id, conversation_id);

COMMIT;
