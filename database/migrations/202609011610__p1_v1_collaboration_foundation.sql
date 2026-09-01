BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE ac_workspace (
    workspace_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_code VARCHAR(64) NOT NULL,
    workspace_name VARCHAR(160) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_ac_workspace_code UNIQUE (workspace_code),
    CONSTRAINT ck_ac_workspace_status CHECK (status IN ('ACTIVE', 'SUSPENDED', 'ARCHIVED'))
);

CREATE TABLE ac_identity (
    identity_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_name VARCHAR(160) NOT NULL,
    primary_email VARCHAR(320),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_ac_identity_status CHECK (status IN ('ACTIVE', 'DISABLED', 'ARCHIVED'))
);

CREATE UNIQUE INDEX uq_ac_identity_primary_email_ci
    ON ac_identity (LOWER(primary_email))
    WHERE primary_email IS NOT NULL;

CREATE TABLE ac_identity_provider_link (
    identity_provider_link_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identity_id UUID NOT NULL REFERENCES ac_identity(identity_id) ON DELETE CASCADE,
    provider_code VARCHAR(40) NOT NULL,
    external_subject VARCHAR(255) NOT NULL,
    provider_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_ac_identity_provider_subject UNIQUE (provider_code, external_subject),
    CONSTRAINT ck_ac_identity_provider_code CHECK (provider_code = UPPER(provider_code))
);

CREATE INDEX ix_ac_identity_provider_identity
    ON ac_identity_provider_link(identity_id);

CREATE TABLE ac_workspace_member (
    workspace_member_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES ac_workspace(workspace_id) ON DELETE CASCADE,
    identity_id UUID NOT NULL REFERENCES ac_identity(identity_id) ON DELETE RESTRICT,
    member_role VARCHAR(20) NOT NULL DEFAULT 'MEMBER',
    display_name_override VARCHAR(160),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_ac_workspace_member_identity UNIQUE (workspace_id, identity_id),
    CONSTRAINT uq_ac_workspace_member_scope UNIQUE (workspace_id, workspace_member_id),
    CONSTRAINT ck_ac_workspace_member_role CHECK (member_role IN ('OWNER', 'ADMIN', 'MEMBER', 'GUEST')),
    CONSTRAINT ck_ac_workspace_member_status CHECK (status IN ('ACTIVE', 'SUSPENDED', 'LEFT'))
);

CREATE INDEX ix_ac_workspace_member_workspace_status
    ON ac_workspace_member(workspace_id, status);

CREATE TABLE ac_conversation (
    conversation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES ac_workspace(workspace_id) ON DELETE CASCADE,
    conversation_type VARCHAR(20) NOT NULL,
    title VARCHAR(200),
    created_by_member_id UUID NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_ac_conversation_scope UNIQUE (workspace_id, conversation_id),
    CONSTRAINT fk_ac_conversation_creator
        FOREIGN KEY (workspace_id, created_by_member_id)
        REFERENCES ac_workspace_member(workspace_id, workspace_member_id)
        ON DELETE RESTRICT,
    CONSTRAINT ck_ac_conversation_type CHECK (conversation_type IN ('CHANNEL', 'DM', 'GROUP_DM')),
    CONSTRAINT ck_ac_conversation_status CHECK (status IN ('ACTIVE', 'ARCHIVED'))
);

CREATE INDEX ix_ac_conversation_workspace_type_status
    ON ac_conversation(workspace_id, conversation_type, status);

CREATE TABLE ac_channel (
    channel_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES ac_workspace(workspace_id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL,
    channel_code VARCHAR(80) NOT NULL,
    channel_name VARCHAR(160) NOT NULL,
    visibility VARCHAR(20) NOT NULL DEFAULT 'PUBLIC',
    created_by_member_id UUID NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_ac_channel_scope UNIQUE (workspace_id, channel_id),
    CONSTRAINT uq_ac_channel_code UNIQUE (workspace_id, channel_code),
    CONSTRAINT uq_ac_channel_conversation UNIQUE (workspace_id, conversation_id),
    CONSTRAINT fk_ac_channel_conversation
        FOREIGN KEY (workspace_id, conversation_id)
        REFERENCES ac_conversation(workspace_id, conversation_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_ac_channel_creator
        FOREIGN KEY (workspace_id, created_by_member_id)
        REFERENCES ac_workspace_member(workspace_id, workspace_member_id)
        ON DELETE RESTRICT,
    CONSTRAINT ck_ac_channel_visibility CHECK (visibility IN ('PUBLIC', 'PRIVATE')),
    CONSTRAINT ck_ac_channel_status CHECK (status IN ('ACTIVE', 'ARCHIVED'))
);

CREATE INDEX ix_ac_channel_workspace_status
    ON ac_channel(workspace_id, status);

CREATE TABLE ac_channel_member (
    workspace_id UUID NOT NULL,
    channel_id UUID NOT NULL,
    workspace_member_id UUID NOT NULL,
    member_role VARCHAR(20) NOT NULL DEFAULT 'MEMBER',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    left_at TIMESTAMPTZ,
    PRIMARY KEY (workspace_id, channel_id, workspace_member_id),
    CONSTRAINT fk_ac_channel_member_channel
        FOREIGN KEY (workspace_id, channel_id)
        REFERENCES ac_channel(workspace_id, channel_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_ac_channel_member_member
        FOREIGN KEY (workspace_id, workspace_member_id)
        REFERENCES ac_workspace_member(workspace_id, workspace_member_id)
        ON DELETE CASCADE,
    CONSTRAINT ck_ac_channel_member_role CHECK (member_role IN ('OWNER', 'MODERATOR', 'MEMBER'))
);

CREATE INDEX ix_ac_channel_member_member
    ON ac_channel_member(workspace_id, workspace_member_id)
    WHERE left_at IS NULL;

CREATE TABLE ac_conversation_participant (
    workspace_id UUID NOT NULL,
    conversation_id UUID NOT NULL,
    workspace_member_id UUID NOT NULL,
    participant_role VARCHAR(20) NOT NULL DEFAULT 'MEMBER',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    left_at TIMESTAMPTZ,
    PRIMARY KEY (workspace_id, conversation_id, workspace_member_id),
    CONSTRAINT fk_ac_conversation_participant_conversation
        FOREIGN KEY (workspace_id, conversation_id)
        REFERENCES ac_conversation(workspace_id, conversation_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_ac_conversation_participant_member
        FOREIGN KEY (workspace_id, workspace_member_id)
        REFERENCES ac_workspace_member(workspace_id, workspace_member_id)
        ON DELETE CASCADE,
    CONSTRAINT ck_ac_conversation_participant_role CHECK (participant_role IN ('OWNER', 'MEMBER'))
);

CREATE INDEX ix_ac_conversation_participant_member
    ON ac_conversation_participant(workspace_id, workspace_member_id)
    WHERE left_at IS NULL;

CREATE TABLE ac_system_sender (
    system_sender_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES ac_workspace(workspace_id) ON DELETE CASCADE,
    sender_code VARCHAR(80) NOT NULL,
    display_name VARCHAR(160) NOT NULL,
    provider_code VARCHAR(40) NOT NULL DEFAULT 'LOCAL',
    external_reference VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_ac_system_sender_scope UNIQUE (workspace_id, system_sender_id),
    CONSTRAINT uq_ac_system_sender_code UNIQUE (workspace_id, sender_code),
    CONSTRAINT ck_ac_system_sender_provider CHECK (provider_code = UPPER(provider_code)),
    CONSTRAINT ck_ac_system_sender_status CHECK (status IN ('ACTIVE', 'DISABLED'))
);

CREATE TABLE ac_message (
    message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES ac_workspace(workspace_id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL,
    sender_type VARCHAR(20) NOT NULL,
    sender_member_id UUID,
    system_sender_id UUID,
    message_type VARCHAR(20) NOT NULL DEFAULT 'TEXT',
    body_text TEXT,
    client_message_id VARCHAR(120),
    source_event_id VARCHAR(160),
    reply_to_message_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    edited_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    CONSTRAINT uq_ac_message_scope UNIQUE (workspace_id, message_id),
    CONSTRAINT fk_ac_message_conversation
        FOREIGN KEY (workspace_id, conversation_id)
        REFERENCES ac_conversation(workspace_id, conversation_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_ac_message_human_sender
        FOREIGN KEY (workspace_id, sender_member_id)
        REFERENCES ac_workspace_member(workspace_id, workspace_member_id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_ac_message_system_sender
        FOREIGN KEY (workspace_id, system_sender_id)
        REFERENCES ac_system_sender(workspace_id, system_sender_id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_ac_message_reply
        FOREIGN KEY (workspace_id, reply_to_message_id)
        REFERENCES ac_message(workspace_id, message_id)
        ON DELETE SET NULL (reply_to_message_id),
    CONSTRAINT ck_ac_message_sender CHECK (
        (sender_type = 'HUMAN' AND sender_member_id IS NOT NULL AND system_sender_id IS NULL)
        OR
        (sender_type = 'SYSTEM' AND sender_member_id IS NULL AND system_sender_id IS NOT NULL)
    ),
    CONSTRAINT ck_ac_message_type CHECK (message_type IN ('TEXT', 'SYSTEM', 'EVENT')),
    CONSTRAINT ck_ac_message_body CHECK (
        body_text IS NOT NULL OR message_type IN ('SYSTEM', 'EVENT')
    )
);

CREATE UNIQUE INDEX uq_ac_message_client_id
    ON ac_message(workspace_id, conversation_id, client_message_id)
    WHERE client_message_id IS NOT NULL;

CREATE INDEX ix_ac_message_history
    ON ac_message(workspace_id, conversation_id, created_at DESC, message_id);

CREATE INDEX ix_ac_message_reply
    ON ac_message(workspace_id, reply_to_message_id)
    WHERE reply_to_message_id IS NOT NULL;

CREATE TABLE ac_message_revision (
    message_revision_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES ac_workspace(workspace_id) ON DELETE CASCADE,
    message_id UUID NOT NULL,
    revision_no INTEGER NOT NULL,
    body_text TEXT,
    edited_by_member_id UUID,
    edited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_ac_message_revision UNIQUE (workspace_id, message_id, revision_no),
    CONSTRAINT fk_ac_message_revision_message
        FOREIGN KEY (workspace_id, message_id)
        REFERENCES ac_message(workspace_id, message_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_ac_message_revision_editor
        FOREIGN KEY (workspace_id, edited_by_member_id)
        REFERENCES ac_workspace_member(workspace_id, workspace_member_id)
        ON DELETE RESTRICT,
    CONSTRAINT ck_ac_message_revision_no CHECK (revision_no > 0)
);

CREATE TABLE ac_read_cursor (
    workspace_id UUID NOT NULL,
    conversation_id UUID NOT NULL,
    workspace_member_id UUID NOT NULL,
    last_read_message_id UUID,
    read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (workspace_id, conversation_id, workspace_member_id),
    CONSTRAINT fk_ac_read_cursor_conversation
        FOREIGN KEY (workspace_id, conversation_id)
        REFERENCES ac_conversation(workspace_id, conversation_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_ac_read_cursor_member
        FOREIGN KEY (workspace_id, workspace_member_id)
        REFERENCES ac_workspace_member(workspace_id, workspace_member_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_ac_read_cursor_message
        FOREIGN KEY (workspace_id, last_read_message_id)
        REFERENCES ac_message(workspace_id, message_id)
        ON DELETE SET NULL (last_read_message_id)
);

CREATE TABLE ac_event_receipt (
    event_receipt_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES ac_workspace(workspace_id) ON DELETE CASCADE,
    source_provider VARCHAR(40) NOT NULL,
    event_id VARCHAR(160) NOT NULL,
    event_type VARCHAR(80) NOT NULL,
    payload_hash VARCHAR(128),
    processing_status VARCHAR(20) NOT NULL DEFAULT 'RECEIVED',
    first_received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    CONSTRAINT uq_ac_event_receipt_scope UNIQUE (workspace_id, event_receipt_id),
    CONSTRAINT uq_ac_event_receipt_provider_event UNIQUE (workspace_id, source_provider, event_id),
    CONSTRAINT ck_ac_event_receipt_provider CHECK (source_provider = UPPER(source_provider)),
    CONSTRAINT ck_ac_event_receipt_status CHECK (processing_status IN ('RECEIVED', 'PROCESSED', 'FAILED'))
);

CREATE INDEX ix_ac_event_receipt_status
    ON ac_event_receipt(workspace_id, processing_status, first_received_at);

COMMIT;
