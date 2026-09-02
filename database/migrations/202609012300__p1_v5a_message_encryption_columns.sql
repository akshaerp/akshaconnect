BEGIN;

ALTER TABLE ac_message
    ADD COLUMN IF NOT EXISTS body_ciphertext BYTEA,
    ADD COLUMN IF NOT EXISTS body_nonce BYTEA,
    ADD COLUMN IF NOT EXISTS body_auth_tag BYTEA,
    ADD COLUMN IF NOT EXISTS body_key_id VARCHAR(120),
    ADD COLUMN IF NOT EXISTS body_encryption_version SMALLINT;

ALTER TABLE ac_message_revision
    ADD COLUMN IF NOT EXISTS body_ciphertext BYTEA,
    ADD COLUMN IF NOT EXISTS body_nonce BYTEA,
    ADD COLUMN IF NOT EXISTS body_auth_tag BYTEA,
    ADD COLUMN IF NOT EXISTS body_key_id VARCHAR(120),
    ADD COLUMN IF NOT EXISTS body_encryption_version SMALLINT;

ALTER TABLE ac_message
    DROP CONSTRAINT IF EXISTS ck_ac_message_encryption_stage_shape;

ALTER TABLE ac_message
    ADD CONSTRAINT ck_ac_message_encryption_stage_shape CHECK (
        (
            body_ciphertext IS NULL
            AND body_nonce IS NULL
            AND body_auth_tag IS NULL
            AND body_key_id IS NULL
            AND body_encryption_version IS NULL
        )
        OR
        (
            body_ciphertext IS NOT NULL
            AND body_nonce IS NOT NULL
            AND OCTET_LENGTH(body_nonce) = 12
            AND body_auth_tag IS NOT NULL
            AND OCTET_LENGTH(body_auth_tag) = 16
            AND body_key_id IS NOT NULL
            AND LENGTH(BTRIM(body_key_id)) BETWEEN 1 AND 120
            AND body_encryption_version = 1
        )
    );

ALTER TABLE ac_message_revision
    DROP CONSTRAINT IF EXISTS ck_ac_message_revision_encryption_stage_shape;

ALTER TABLE ac_message_revision
    ADD CONSTRAINT ck_ac_message_revision_encryption_stage_shape CHECK (
        (
            body_ciphertext IS NULL
            AND body_nonce IS NULL
            AND body_auth_tag IS NULL
            AND body_key_id IS NULL
            AND body_encryption_version IS NULL
        )
        OR
        (
            body_ciphertext IS NOT NULL
            AND body_nonce IS NOT NULL
            AND OCTET_LENGTH(body_nonce) = 12
            AND body_auth_tag IS NOT NULL
            AND OCTET_LENGTH(body_auth_tag) = 16
            AND body_key_id IS NOT NULL
            AND LENGTH(BTRIM(body_key_id)) BETWEEN 1 AND 120
            AND body_encryption_version = 1
        )
    );

COMMIT;
