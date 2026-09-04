
DO $$
DECLARE
    message_type_def TEXT;
BEGIN
    IF to_regclass('public.ac_attachment') IS NULL THEN
        RAISE EXCEPTION 'P1-V7 attachment table is missing';
    END IF;

    SELECT pg_get_constraintdef(oid)
    INTO message_type_def
    FROM pg_constraint
    WHERE conrelid = 'ac_message'::regclass
      AND conname = 'ck_ac_message_type';

    IF message_type_def IS NULL OR POSITION('ATTACHMENT' IN message_type_def) = 0 THEN
        RAISE EXCEPTION 'P1-V7 ATTACHMENT message type is not enabled';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'ac_attachment'
          AND column_name IN (
              'original_file_name',
              'file_name',
              'content_bytes',
              'plaintext_content'
          )
    ) THEN
        RAISE EXCEPTION 'P1-V7 attachment table exposes forbidden plaintext/blob columns';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'ac_attachment'::regclass
          AND conname = 'fk_ac_attachment_message'
    ) THEN
        RAISE EXCEPTION 'P1-V7 message/attachment scope FK is missing';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'ac_attachment'::regclass
          AND conname = 'ck_ac_attachment_crypto'
    ) THEN
        RAISE EXCEPTION 'P1-V7 attachment encryption shape constraint is missing';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM ac_attachment
        WHERE size_bytes < 1
           OR size_bytes > 10485760
           OR OCTET_LENGTH(content_nonce) <> 12
           OR OCTET_LENGTH(content_auth_tag) <> 16
           OR encryption_version <> 1
           OR sha256_hex !~ '^[0-9a-f]{64}$'
    ) THEN
        RAISE EXCEPTION 'P1-V7 attachment rows violate structural security limits';
    END IF;
END
$$;

SELECT 'p1_v7_attachment_foundation_gate' AS gate, 'PASS' AS result;
