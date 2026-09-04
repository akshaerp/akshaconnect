
BEGIN;

ALTER TABLE ac_message
    DROP CONSTRAINT ck_ac_message_type;

ALTER TABLE ac_message
    ADD CONSTRAINT ck_ac_message_type
    CHECK (message_type IN ('TEXT', 'SYSTEM', 'EVENT', 'ATTACHMENT'));

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'uq_ac_message_conversation_scope'
          AND conrelid = 'ac_message'::regclass
    ) THEN
        ALTER TABLE ac_message
            ADD CONSTRAINT uq_ac_message_conversation_scope
            UNIQUE (workspace_id, conversation_id, message_id);
    END IF;
END
$$;

CREATE TABLE ac_attachment (
    attachment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES ac_workspace(workspace_id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL,
    message_id UUID NOT NULL,
    uploaded_by_member_id UUID NOT NULL,
    content_type VARCHAR(120) NOT NULL,
    size_bytes BIGINT NOT NULL,
    sha256_hex CHAR(64) NOT NULL,
    storage_provider VARCHAR(20) NOT NULL,
    storage_key VARCHAR(255) NOT NULL,
    content_nonce BYTEA NOT NULL,
    content_auth_tag BYTEA NOT NULL,
    encryption_key_id VARCHAR(120) NOT NULL,
    encryption_version SMALLINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_ac_attachment_scope
        UNIQUE (workspace_id, attachment_id),

    CONSTRAINT uq_ac_attachment_message
        UNIQUE (workspace_id, message_id),

    CONSTRAINT uq_ac_attachment_storage
        UNIQUE (storage_provider, storage_key),

    CONSTRAINT fk_ac_attachment_message
        FOREIGN KEY (workspace_id, conversation_id, message_id)
        REFERENCES ac_message(workspace_id, conversation_id, message_id)
        ON DELETE CASCADE,

    CONSTRAINT fk_ac_attachment_uploader
        FOREIGN KEY (workspace_id, uploaded_by_member_id)
        REFERENCES ac_workspace_member(workspace_id, workspace_member_id)
        ON DELETE RESTRICT,

    CONSTRAINT ck_ac_attachment_content_type
        CHECK (LENGTH(BTRIM(content_type)) BETWEEN 1 AND 120),

    CONSTRAINT ck_ac_attachment_size
        CHECK (size_bytes BETWEEN 1 AND 10485760),

    CONSTRAINT ck_ac_attachment_sha256
        CHECK (sha256_hex ~ '^[0-9a-f]{64}$'),

    CONSTRAINT ck_ac_attachment_storage_provider
        CHECK (storage_provider IN ('LOCAL', 'S3')),

    CONSTRAINT ck_ac_attachment_storage_key
        CHECK (LENGTH(BTRIM(storage_key)) BETWEEN 1 AND 255),

    CONSTRAINT ck_ac_attachment_crypto
        CHECK (
            OCTET_LENGTH(content_nonce) = 12
            AND OCTET_LENGTH(content_auth_tag) = 16
            AND LENGTH(BTRIM(encryption_key_id)) BETWEEN 1 AND 120
            AND encryption_version = 1
        )
);

CREATE INDEX ix_ac_attachment_conversation_message
    ON ac_attachment(workspace_id, conversation_id, message_id);

CREATE INDEX ix_ac_attachment_key_rotation
    ON ac_attachment(encryption_key_id, workspace_id, attachment_id);

COMMIT;
