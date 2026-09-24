-- AkshaConnect Tenant -> Multiple Workspaces V1 preflight (READ ONLY)

BEGIN;
SET TRANSACTION READ ONLY;

DO $$
DECLARE
    v_count bigint;
    v_workspace_id uuid;
BEGIN
    IF current_database() <> 'akshaconnect'
       AND current_database() NOT LIKE 'akshaconnect_trial_%' THEN
        RAISE EXCEPTION 'Expected database akshaconnect, found %', current_database();
    END IF;

    IF to_regclass('public.ac_workspace') IS NULL
       OR to_regclass('public.ac_identity') IS NULL
       OR to_regclass('public.ac_workspace_member') IS NULL
       OR to_regclass('public.ac_session') IS NULL THEN
        RAISE EXCEPTION 'AkshaConnect foundation tables are missing';
    END IF;

    IF to_regclass('public.ac_workspace_provider_link') IS NULL THEN
        RAISE EXCEPTION 'Expected reviewed legacy ac_workspace_provider_link bridge table is missing';
    END IF;

    SELECT count(*) INTO v_count
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ac_session'
      AND column_name = 'identity_provider';

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Expected ac_session.identity_provider from reviewed SSO bridge';
    END IF;

    SELECT workspace_id INTO v_workspace_id
    FROM public.ac_workspace
    WHERE workspace_code = 'AKSHAERP'
      AND workspace_name = 'AkshaERP Solutions Private Limited'
      AND status = 'ACTIVE';

    IF v_workspace_id IS NULL THEN
        RAISE EXCEPTION 'Expected ACTIVE AKSHAERP workspace was not found';
    END IF;

    SELECT count(*) INTO v_count
    FROM public.ac_workspace_provider_link
    WHERE provider_code = 'AKSHAERP'
      AND external_subject = 'APP'
      AND workspace_id = v_workspace_id
      AND status = 'ACTIVE';

    IF v_count <> 1 THEN
        RAISE EXCEPTION
            'Expected exactly one ACTIVE legacy AKSHAERP/APP mapping to AKSHAERP workspace, found %',
            v_count;
    END IF;

    IF (
        (to_regclass('public.ac_db_baseline') IS NULL)::int +
        (to_regclass('public.ac_db_migrations') IS NULL)::int +
        (to_regclass('public.ac_db_seed_runs') IS NULL)::int
    ) NOT IN (0, 3) THEN
        RAISE EXCEPTION 'Partial AkshaConnect lifecycle foundation detected';
    END IF;

    IF to_regclass('public.ac_tenant') IS NOT NULL
       OR to_regclass('public.ac_tenant_provider_link') IS NOT NULL THEN
        RAISE EXCEPTION 'Tenant tables already exist; use postcheck instead of preflight';
    END IF;

    SELECT count(*) INTO v_count
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ac_workspace'
      AND column_name IN ('tenant_id', 'default_flag');

    IF v_count <> 0 THEN
        RAISE EXCEPTION 'Partial tenant columns already exist on ac_workspace: % of 2', v_count;
    END IF;
END
$$;

SELECT workspace_id, workspace_code, workspace_name, status
FROM public.ac_workspace
ORDER BY workspace_code;

SELECT p.provider_code, p.external_subject, p.workspace_id, p.status, w.workspace_code
FROM public.ac_workspace_provider_link p
JOIN public.ac_workspace w ON w.workspace_id = p.workspace_id
ORDER BY p.provider_code, p.external_subject;

SELECT 'AKSHACONNECT_TENANT_MULTIWORKSPACE_V1_PREFLIGHT=PASS' AS result;

ROLLBACK;
