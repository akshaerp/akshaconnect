DO $$
BEGIN
    IF to_regclass(
        'public.ac_push_registration'
    ) IS NULL THEN
        RAISE EXCEPTION
            'ac_push_registration is missing';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname =
            'uq_ac_push_registration_provider_token'
    ) THEN
        RAISE EXCEPTION
            'push provider/token uniqueness constraint is missing';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname =
            'ix_ac_push_registration_active_device'
    ) THEN
        RAISE EXCEPTION
            'active push device index is missing';
    END IF;
END
$$;

SELECT
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'ac_push_registration'
ORDER BY ordinal_position;

-- V3D PUSH PRIVILEGE VERIFICATION
DO $$
BEGIN
    IF NOT has_table_privilege(
        'akshaconnect',
        'public.ac_push_registration',
        'SELECT'
    ) THEN
        RAISE EXCEPTION
            'akshaconnect role missing SELECT on ac_push_registration';
    END IF;

    IF NOT has_table_privilege(
        'akshaconnect',
        'public.ac_push_registration',
        'INSERT'
    ) THEN
        RAISE EXCEPTION
            'akshaconnect role missing INSERT on ac_push_registration';
    END IF;

    IF NOT has_table_privilege(
        'akshaconnect',
        'public.ac_push_registration',
        'UPDATE'
    ) THEN
        RAISE EXCEPTION
            'akshaconnect role missing UPDATE on ac_push_registration';
    END IF;

    IF has_table_privilege(
        'akshaconnect',
        'public.ac_push_registration',
        'DELETE'
    ) THEN
        RAISE EXCEPTION
            'akshaconnect role must not have DELETE on ac_push_registration';
    END IF;
END
$$;