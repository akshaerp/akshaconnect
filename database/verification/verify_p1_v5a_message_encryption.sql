SELECT current_database() AS current_database;

SELECT
    CASE WHEN NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'ac_message'
          AND column_name = 'body_text'
    ) THEN 'PASS' ELSE 'FAIL' END AS p1_v5a_message_plaintext_column_removed_gate,
    CASE WHEN NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'ac_message_revision'
          AND column_name = 'body_text'
    ) THEN 'PASS' ELSE 'FAIL' END AS p1_v5a_revision_plaintext_column_removed_gate;

SELECT
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'ac_message' AND column_name = 'body_ciphertext'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'ac_message' AND column_name = 'body_nonce'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'ac_message' AND column_name = 'body_auth_tag'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'ac_message' AND column_name = 'body_key_id'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'ac_message' AND column_name = 'body_encryption_version'
    ) THEN 'PASS' ELSE 'FAIL' END AS p1_v5a_message_cipher_columns_gate;

SELECT
    CASE WHEN NOT EXISTS (
        SELECT 1
        FROM ac_message
        WHERE message_type = 'TEXT'
          AND (
              body_ciphertext IS NULL
              OR body_nonce IS NULL
              OR OCTET_LENGTH(body_nonce) <> 12
              OR body_auth_tag IS NULL
              OR OCTET_LENGTH(body_auth_tag) <> 16
              OR body_key_id IS NULL
              OR body_encryption_version <> 1
          )
    ) THEN 'PASS' ELSE 'FAIL' END AS p1_v5a_text_messages_encrypted_gate,
    CASE WHEN NOT EXISTS (
        SELECT 1
        FROM ac_message
        WHERE body_ciphertext IS NOT NULL
          AND (
              body_nonce IS NULL
              OR body_auth_tag IS NULL
              OR body_key_id IS NULL
              OR body_encryption_version <> 1
          )
    ) THEN 'PASS' ELSE 'FAIL' END AS p1_v5a_encryption_shape_gate;

SELECT
    CASE WHEN EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_ac_message_encrypted_body'
    ) THEN 'PASS' ELSE 'FAIL' END AS p1_v5a_message_constraint_gate,
    CASE WHEN EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_ac_message_revision_encrypted_body'
    ) THEN 'PASS' ELSE 'FAIL' END AS p1_v5a_revision_constraint_gate;

SELECT
    CASE WHEN EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = 'ix_ac_message_key_rotation'
    ) THEN 'PASS' ELSE 'FAIL' END AS p1_v5a_message_key_rotation_index_gate,
    CASE WHEN EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = 'ix_ac_message_revision_key_rotation'
    ) THEN 'PASS' ELSE 'FAIL' END AS p1_v5a_revision_key_rotation_index_gate;

SELECT
    body_key_id,
    body_encryption_version,
    COUNT(*) AS encrypted_message_count
FROM ac_message
WHERE body_ciphertext IS NOT NULL
GROUP BY body_key_id, body_encryption_version
ORDER BY body_key_id, body_encryption_version;
