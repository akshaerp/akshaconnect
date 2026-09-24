-- APP / AkshaERP Solutions instance provisioning for the shared AkshaConnect SaaS DB.
-- INSTANCE CONFIGURATION, not a product migration.
-- No numeric/UUID IDs are copied; stable business keys are used.
-- No BEGIN/COMMIT; deployment runner owns transaction + seed ledger.

DO $$
DECLARE
    v_legacy_workspace_id uuid;
    v_tenant_id uuid;
    v_count bigint;
BEGIN
    IF current_database() <> 'akshaconnect'
       AND current_database() NOT LIKE 'akshaconnect_trial_%' THEN
        RAISE EXCEPTION 'Expected database akshaconnect, found %', current_database();
    END IF;

    IF to_regclass('public.ac_tenant') IS NULL
       OR to_regclass('public.ac_tenant_provider_link') IS NULL
       OR to_regclass('public.ac_workspace_provider_link') IS NULL
       OR to_regclass('public.ac_db_seed_runs') IS NULL THEN
        RAISE EXCEPTION 'Required product/lifecycle schema is missing';
    END IF;

    SELECT workspace_id INTO v_legacy_workspace_id
    FROM public.ac_workspace
    WHERE workspace_code = 'AKSHAERP'
      AND workspace_name = 'AkshaERP Solutions Private Limited'
      AND status = 'ACTIVE';

    IF v_legacy_workspace_id IS NULL THEN
        RAISE EXCEPTION 'Reviewed AKSHAERP workspace is missing';
    END IF;

    SELECT count(*) INTO v_count
    FROM public.ac_workspace_provider_link
    WHERE provider_code = 'AKSHAERP'
      AND external_subject = 'APP'
      AND workspace_id = v_legacy_workspace_id
      AND status = 'ACTIVE';

    IF v_count <> 1 THEN
        RAISE EXCEPTION
            'Expected exactly one reviewed legacy AKSHAERP/APP workspace mapping, found %',
            v_count;
    END IF;

    SELECT tenant_id INTO v_tenant_id
    FROM public.ac_tenant
    WHERE tenant_code = 'AKSHAERP_INTERNAL';

    IF v_tenant_id IS NULL THEN
        INSERT INTO public.ac_tenant (
            tenant_code,
            tenant_name,
            status,
            metadata_json
        )
        VALUES (
            'AKSHAERP_INTERNAL',
            'AkshaERP Solutions Private Limited',
            'ACTIVE',
            jsonb_build_object('deployment','INTERNAL','erp_tenant_code','app')
        )
        RETURNING tenant_id INTO v_tenant_id;
    ELSE
        IF NOT EXISTS (
            SELECT 1
            FROM public.ac_tenant
            WHERE tenant_id = v_tenant_id
              AND tenant_name = 'AkshaERP Solutions Private Limited'
              AND status = 'ACTIVE'
        ) THEN
            RAISE EXCEPTION 'Existing AKSHAERP_INTERNAL tenant does not match reviewed contract';
        END IF;
    END IF;

    SELECT count(*) INTO v_count
    FROM public.ac_tenant_provider_link
    WHERE provider_code = 'AKSHAERP'
      AND external_subject = 'APP';

    IF v_count > 1 THEN
        RAISE EXCEPTION 'Multiple AKSHAERP/APP tenant provider links exist: %', v_count;
    END IF;

    IF v_count = 1 THEN
        IF NOT EXISTS (
            SELECT 1
            FROM public.ac_tenant_provider_link
            WHERE provider_code = 'AKSHAERP'
              AND external_subject = 'APP'
              AND tenant_id = v_tenant_id
              AND status = 'ACTIVE'
        ) THEN
            RAISE EXCEPTION
                'Existing AKSHAERP/APP tenant link points to a different or inactive tenant';
        END IF;
    ELSE
        INSERT INTO public.ac_tenant_provider_link (
            tenant_id,
            provider_code,
            external_subject,
            provider_metadata,
            status
        )
        VALUES (
            v_tenant_id,
            'AKSHAERP',
            'APP',
            jsonb_build_object(
                'provider_base_url','https://app.akshaerp.com',
                'provider_tenant_code','app',
                'purpose','AKSHAERP_INTERNAL_SSO'
            ),
            'ACTIVE'
        );
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.ac_workspace
        WHERE tenant_id = v_tenant_id
          AND default_flag = 'Y'
          AND workspace_id <> v_legacy_workspace_id
    ) THEN
        RAISE EXCEPTION 'AKSHAERP_INTERNAL already has a different default workspace';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.ac_workspace
        WHERE workspace_id = v_legacy_workspace_id
          AND tenant_id IS NOT NULL
          AND tenant_id <> v_tenant_id
    ) THEN
        RAISE EXCEPTION 'AKSHAERP workspace is already assigned to a different tenant';
    END IF;

    UPDATE public.ac_workspace
    SET tenant_id = v_tenant_id,
        default_flag = 'Y',
        updated_at = NOW()
    WHERE workspace_id = v_legacy_workspace_id
      AND (tenant_id IS DISTINCT FROM v_tenant_id OR default_flag <> 'Y');

    -- Deliberately DO NOT assign unrelated legacy workspaces such as DEV_ALPHA/DEV_BETA.
END
$$;

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
        RAISE EXCEPTION
            'Expected exactly one active AKSHAERP/APP -> AKSHAERP_INTERNAL tenant mapping, found %',
            v_count;
    END IF;

    SELECT count(*) INTO v_count
    FROM public.ac_workspace w
    JOIN public.ac_tenant t ON t.tenant_id = w.tenant_id
    WHERE t.tenant_code = 'AKSHAERP_INTERNAL'
      AND w.workspace_code = 'AKSHAERP'
      AND w.default_flag = 'Y'
      AND w.status = 'ACTIVE';

    IF v_count <> 1 THEN
        RAISE EXCEPTION
            'Expected exactly one ACTIVE default AKSHAERP workspace under AKSHAERP_INTERNAL, found %',
            v_count;
    END IF;
END
$$;
