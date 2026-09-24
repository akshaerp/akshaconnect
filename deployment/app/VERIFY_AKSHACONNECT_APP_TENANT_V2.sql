-- APP tenant provisioning verification (READ ONLY)

BEGIN;
SET TRANSACTION READ ONLY;

DO $$
DECLARE
    v_count bigint;
BEGIN
    SELECT count(*) INTO v_count
    FROM public.ac_tenant_provider_link p
    JOIN public.ac_tenant t ON t.tenant_id = p.tenant_id
    WHERE p.provider_code = 'AKSHAERP'
      AND p.external_subject = 'APP'
      AND p.status = 'ACTIVE'
      AND t.tenant_code = 'AKSHAERP_INTERNAL'
      AND t.status = 'ACTIVE';

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'APP tenant mapping verification failed: %', v_count;
    END IF;

    SELECT count(*) INTO v_count
    FROM public.ac_workspace w
    JOIN public.ac_tenant t ON t.tenant_id = w.tenant_id
    WHERE t.tenant_code = 'AKSHAERP_INTERNAL'
      AND w.default_flag = 'Y'
      AND w.workspace_code = 'AKSHAERP'
      AND w.status = 'ACTIVE';

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'APP default workspace verification failed: %', v_count;
    END IF;

    SELECT count(*) INTO v_count
    FROM public.ac_workspace
    WHERE workspace_code IN ('DEV_ALPHA', 'DEV_BETA')
      AND tenant_id IS NOT NULL;

    IF v_count <> 0 THEN
        RAISE EXCEPTION 'Legacy DEV workspaces were unexpectedly tenant-assigned: %', v_count;
    END IF;

    SELECT count(*) INTO v_count
    FROM public.ac_db_seed_runs
    WHERE seed_code = 'AKSHACONNECT_APP_TENANT_V2'
      AND status = 'SUCCESS';

    IF v_count <> 1 THEN
        RAISE EXCEPTION
            'Expected one SUCCESS seed ledger row for AKSHACONNECT_APP_TENANT_V2, found %',
            v_count;
    END IF;
END
$$;

SELECT t.tenant_id, t.tenant_code, t.tenant_name, t.status,
       p.provider_code, p.external_subject, p.status AS provider_link_status
FROM public.ac_tenant t
JOIN public.ac_tenant_provider_link p ON p.tenant_id = t.tenant_id
WHERE t.tenant_code = 'AKSHAERP_INTERNAL';

SELECT w.workspace_id, w.workspace_code, w.workspace_name,
       w.default_flag, w.status, t.tenant_code
FROM public.ac_workspace w
LEFT JOIN public.ac_tenant t ON t.tenant_id = w.tenant_id
ORDER BY COALESCE(t.tenant_code, '~UNASSIGNED~'), w.workspace_code;

SELECT 'AKSHACONNECT_APP_TENANT_V2_VERIFY=PASS' AS result;

ROLLBACK;
