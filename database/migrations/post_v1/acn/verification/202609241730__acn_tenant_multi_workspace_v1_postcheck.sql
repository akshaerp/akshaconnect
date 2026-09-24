-- AkshaConnect Tenant -> Multiple Workspaces V1 postcheck (READ ONLY)

BEGIN;
SET TRANSACTION READ ONLY;

DO $$
DECLARE
    v_count bigint;
BEGIN
    IF current_database() <> 'akshaconnect'
       AND current_database() NOT LIKE 'akshaconnect_trial_%' THEN
        RAISE EXCEPTION 'Expected database akshaconnect, found %', current_database();
    END IF;

    IF to_regclass('public.ac_db_baseline') IS NULL
       OR to_regclass('public.ac_db_migrations') IS NULL
       OR to_regclass('public.ac_db_seed_runs') IS NULL THEN
        RAISE EXCEPTION 'Lifecycle foundation is missing';
    END IF;

    SELECT count(*) INTO v_count
    FROM public.ac_db_baseline
    WHERE baseline_code = 'AKSHACONNECT_DB_BASELINE_V1';

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Baseline marker mismatch: %', v_count;
    END IF;

    IF to_regclass('public.ac_tenant') IS NULL
       OR to_regclass('public.ac_tenant_provider_link') IS NULL THEN
        RAISE EXCEPTION 'Tenant foundation tables are missing';
    END IF;

    SELECT count(*) INTO v_count
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ac_workspace'
      AND column_name IN ('tenant_id', 'default_flag');

    IF v_count <> 2 THEN
        RAISE EXCEPTION 'ac_workspace tenant columns mismatch: % of 2', v_count;
    END IF;

    SELECT count(*) INTO v_count
    FROM public.ac_db_migrations
    WHERE migration_file IN (
        'database/migrations/post_v1/core/202609241700__core_database_lifecycle_v1.sql',
        'database/migrations/post_v1/acn/202609241730__acn_tenant_multi_workspace_v1.sql'
    )
      AND status = 'SUCCESS';

    IF v_count <> 2 THEN
        RAISE EXCEPTION
            'Expected two successful lifecycle/multi-workspace migration ledger rows, found %',
            v_count;
    END IF;

    SELECT count(*) INTO v_count
    FROM public.ac_db_migrations
    WHERE status = 'FAILED';

    IF v_count <> 0 THEN
        RAISE EXCEPTION 'FAILED migration rows exist: %', v_count;
    END IF;
END
$$;

SELECT baseline_code, baseline_version, established_at
FROM public.ac_db_baseline
ORDER BY baseline_id;

SELECT module_code, migration_type, migration_file, migration_sha256, status, applied_at
FROM public.ac_db_migrations
ORDER BY migration_id;

SELECT 'AKSHACONNECT_TENANT_MULTIWORKSPACE_V1_POSTCHECK=PASS' AS result;

ROLLBACK;
