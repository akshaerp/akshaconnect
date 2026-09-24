-- AkshaConnect Tenant -> Multiple Workspaces foundation V1
-- Product migration only. No customer/ERP tenant-specific rows are inserted here.
-- No BEGIN/COMMIT; the deployment runner owns transaction + ledger.

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
        RAISE EXCEPTION 'AkshaConnect lifecycle foundation is missing';
    END IF;

    SELECT count(*) INTO v_count
    FROM public.ac_db_baseline
    WHERE baseline_code = 'AKSHACONNECT_DB_BASELINE_V1';

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Expected exactly one AKSHACONNECT_DB_BASELINE_V1 marker, found %', v_count;
    END IF;

    SELECT count(*) INTO v_count
    FROM public.ac_db_migrations
    WHERE status = 'FAILED';

    IF v_count <> 0 THEN
        RAISE EXCEPTION 'FAILED AkshaConnect migration ledger rows must be resolved first: %', v_count;
    END IF;

    IF to_regclass('public.ac_workspace') IS NULL
       OR to_regclass('public.ac_workspace_member') IS NULL
       OR to_regclass('public.ac_identity_provider_link') IS NULL THEN
        RAISE EXCEPTION 'Required AkshaConnect collaboration tables are missing';
    END IF;

    IF to_regclass('public.ac_tenant') IS NOT NULL
       OR to_regclass('public.ac_tenant_provider_link') IS NOT NULL THEN
        RAISE EXCEPTION 'Tenant tables already exist before this migration';
    END IF;

    SELECT count(*) INTO v_count
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ac_workspace'
      AND column_name IN ('tenant_id', 'default_flag');

    IF v_count <> 0 THEN
        RAISE EXCEPTION 'ac_workspace contains partial tenant columns before migration: % of 2', v_count;
    END IF;
END
$$;

CREATE TABLE public.ac_tenant (
    tenant_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_code VARCHAR(80) NOT NULL,
    tenant_name VARCHAR(200) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_ac_tenant_code UNIQUE (tenant_code),
    CONSTRAINT ck_ac_tenant_code CHECK (tenant_code = UPPER(tenant_code)),
    CONSTRAINT ck_ac_tenant_status CHECK (status IN ('ACTIVE', 'SUSPENDED', 'ARCHIVED'))
);

CREATE TABLE public.ac_tenant_provider_link (
    tenant_provider_link_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.ac_tenant(tenant_id) ON DELETE CASCADE,
    provider_code VARCHAR(40) NOT NULL,
    external_subject VARCHAR(255) NOT NULL,
    provider_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_ac_tenant_provider_subject UNIQUE (provider_code, external_subject),
    CONSTRAINT ck_ac_tenant_provider_code CHECK (provider_code = UPPER(provider_code)),
    CONSTRAINT ck_ac_tenant_provider_status CHECK (status IN ('ACTIVE', 'DISABLED'))
);

CREATE INDEX ix_ac_tenant_provider_tenant_status
    ON public.ac_tenant_provider_link(tenant_id, status);

ALTER TABLE public.ac_workspace ADD COLUMN tenant_id UUID NULL;
ALTER TABLE public.ac_workspace ADD COLUMN default_flag CHAR(1) NOT NULL DEFAULT 'N';

ALTER TABLE public.ac_workspace
    ADD CONSTRAINT fk_ac_workspace_tenant
    FOREIGN KEY (tenant_id)
    REFERENCES public.ac_tenant(tenant_id)
    ON DELETE RESTRICT;

ALTER TABLE public.ac_workspace
    ADD CONSTRAINT ck_ac_workspace_default_flag
    CHECK (default_flag IN ('Y', 'N'));

CREATE INDEX ix_ac_workspace_tenant_status
    ON public.ac_workspace(tenant_id, status, workspace_name)
    WHERE tenant_id IS NOT NULL;

CREATE UNIQUE INDEX uq_ac_workspace_default_per_tenant
    ON public.ac_workspace(tenant_id)
    WHERE tenant_id IS NOT NULL
      AND default_flag = 'Y';

DO $$
DECLARE
    v_count bigint;
BEGIN
    IF to_regclass('public.ac_tenant') IS NULL
       OR to_regclass('public.ac_tenant_provider_link') IS NULL THEN
        RAISE EXCEPTION 'Tenant tables were not created';
    END IF;

    SELECT count(*) INTO v_count
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ac_workspace'
      AND column_name IN ('tenant_id', 'default_flag');

    IF v_count <> 2 THEN
        RAISE EXCEPTION 'Expected tenant_id/default_flag on ac_workspace, found % of 2', v_count;
    END IF;

    SELECT count(*) INTO v_count
    FROM public.ac_workspace
    WHERE tenant_id IS NOT NULL OR default_flag <> 'N';

    IF v_count <> 0 THEN
        RAISE EXCEPTION
            'Product migration must not assign existing workspaces to a tenant; found % changed workspace rows',
            v_count;
    END IF;
END
$$;
