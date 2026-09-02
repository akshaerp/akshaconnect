BEGIN;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM ac_message
        WHERE body_text IS NOT NULL
          AND (
              body_ciphertext IS NULL
              OR body_nonce IS NULL
              OR body_auth_tag IS NULL
              OR body_key_id IS NULL
              OR body_encryption_version IS NULL
          )
    ) THEN
        RAISE EXCEPTION 'P1-V5A cannot finalize: plaintext ac_message rows remain unencrypted';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM ac_message_revision
        WHERE body_text IS NOT NULL
          AND (
              body_ciphertext IS NULL
              OR body_nonce IS NULL
              OR body_auth_tag IS NULL
              OR body_key_id IS NULL
              OR body_encryption_version IS NULL
          )
    ) THEN
        RAISE EXCEPTION 'P1-V5A cannot finalize: plaintext ac_message_revision rows remain unencrypted';
    END IF;
END
$$;

ALTER TABLE ac_message
    DROP CONSTRAINT IF EXISTS ck_ac_message_body;

ALTER TABLE ac_message
    DROP CONSTRAINT IF EXISTS ck_ac_message_encryption_stage_shape;

ALTER TABLE ac_message
    DROP COLUMN body_text;

ALTER TABLE ac_message
    ADD CONSTRAINT ck_ac_message_encrypted_body CHECK (
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
        OR
        (
            message_type IN ('SYSTEM', 'EVENT')
            AND body_ciphertext IS NULL
            AND body_nonce IS NULL
            AND body_auth_tag IS NULL
            AND body_key_id IS NULL
            AND body_encryption_version IS NULL
        )
    );

ALTER TABLE ac_message_revision
    DROP CONSTRAINT IF EXISTS ck_ac_message_revision_encryption_stage_shape;

ALTER TABLE ac_message_revision
    DROP COLUMN body_text;

ALTER TABLE ac_message_revision
    ADD CONSTRAINT ck_ac_message_revision_encrypted_body CHECK (
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
        OR
        (
            body_ciphertext IS NULL
            AND body_nonce IS NULL
            AND body_auth_tag IS NULL
            AND body_key_id IS NULL
            AND body_encryption_version IS NULL
        )
    );

CREATE INDEX IF NOT EXISTS ix_ac_message_key_rotation
    ON ac_message(body_key_id, workspace_id, message_id)
    WHERE body_key_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_ac_message_revision_key_rotation
    ON ac_message_revision(body_key_id, workspace_id, message_revision_id)
    WHERE body_key_id IS NOT NULL;

COMMIT;
