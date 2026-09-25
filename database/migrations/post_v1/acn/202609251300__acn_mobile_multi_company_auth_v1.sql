-- AkshaConnect Mobile Multi-Company Authentication V1
-- Product migration only. Customer-specific discovery domains are provisioned separately.
-- No BEGIN/COMMIT; the deployment runner owns transaction + migration ledger.

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
       OR to_regclass('public.ac_tenant') IS NULL
       OR to_regclass('public.ac_tenant_provider_link') IS NULL
       OR to_regclass('public.ac_device_session') IS NULL THEN
        RAISE EXCEPTION 'Required AkshaConnect lifecycle/auth foundation is missing';
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
        RAISE EXCEPTION 'FAILED AkshaConnect migration rows must be resolved first: %', v_count;
    END IF;

    IF to_regclass('public.ac_tenant_login_domain') IS NOT NULL
       OR to_regclass('public.ac_mobile_auth_request') IS NOT NULL THEN
        RAISE EXCEPTION 'Mobile multi-company auth tables already exist before migration';
    END IF;

    SELECT count(*) INTO v_count
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ac_device_session'
      AND column_name = 'identity_provider';

    IF v_count <> 0 THEN
        RAISE EXCEPTION 'ac_device_session.identity_provider already exists before migration';
    END IF;
END
$$;

ALTER TABLE public.ac_device_session
    ADD COLUMN identity_provider VARCHAR(40) NOT NULL DEFAULT 'LOCAL';

ALTER TABLE public.ac_device_session
    ADD CONSTRAINT ck_ac_device_session_identity_provider_upper
    CHECK (identity_provider = UPPER(identity_provider));

CREATE INDEX ix_ac_device_session_active_provider_identity
    ON public.ac_device_session(identity_provider, identity_id, expires_at DESC)
    WHERE revoked_at IS NULL;

CREATE TABLE public.ac_tenant_login_domain (
    tenant_login_domain_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL
        REFERENCES public.ac_tenant(tenant_id)
        ON DELETE CASCADE,
    email_domain VARCHAR(255) NOT NULL,
    provider_code VARCHAR(40) NOT NULL,
    authorization_origin TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_ac_tenant_login_domain
        UNIQUE (tenant_id, email_domain, provider_code),
    CONSTRAINT ck_ac_tenant_login_domain_lower
        CHECK (email_domain = LOWER(email_domain)),
    CONSTRAINT ck_ac_tenant_login_provider_upper
        CHECK (provider_code = UPPER(provider_code)),
    CONSTRAINT ck_ac_tenant_login_domain_status
        CHECK (status IN ('ACTIVE', 'DISABLED')),
    CONSTRAINT ck_ac_tenant_login_origin_https
        CHECK (authorization_origin ~ '^https://[^[:space:]]+$')
);

CREATE INDEX ix_ac_tenant_login_domain_lookup
    ON public.ac_tenant_login_domain(email_domain, status, provider_code);

CREATE TABLE public.ac_mobile_auth_request (
    auth_request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL
        REFERENCES public.ac_tenant(tenant_id)
        ON DELETE CASCADE,
    provider_code VARCHAR(40) NOT NULL,
    requested_email VARCHAR(320) NOT NULL,
    redirect_uri TEXT NOT NULL,
    state_value VARCHAR(128) NOT NULL,
    exchange_secret_hash CHAR(64) NOT NULL,
    authorization_code_hash CHAR(64),
    device_platform VARCHAR(20) NOT NULL,
    device_label VARCHAR(120),
    identity_id UUID,
    workspace_id UUID,
    workspace_member_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    authorized_at TIMESTAMPTZ,
    consumed_at TIMESTAMPTZ,
    client_ip_hash CHAR(64),
    user_agent_hash CHAR(64),
    CONSTRAINT uq_ac_mobile_auth_state UNIQUE (state_value),
    CONSTRAINT uq_ac_mobile_auth_code_hash UNIQUE (authorization_code_hash),
    CONSTRAINT ck_ac_mobile_auth_provider_upper
        CHECK (provider_code = UPPER(provider_code)),
    CONSTRAINT ck_ac_mobile_auth_platform
        CHECK (device_platform IN ('ANDROID', 'IOS')),
    CONSTRAINT ck_ac_mobile_auth_expiry
        CHECK (expires_at > created_at),
    CONSTRAINT ck_ac_mobile_auth_redirect
        CHECK (redirect_uri = 'akshaconnect://auth/callback'),
    CONSTRAINT fk_ac_mobile_auth_member_identity
        FOREIGN KEY (workspace_id, workspace_member_id, identity_id)
        REFERENCES public.ac_workspace_member(workspace_id, workspace_member_id, identity_id)
        ON DELETE SET NULL
);

CREATE INDEX ix_ac_mobile_auth_request_active
    ON public.ac_mobile_auth_request(provider_code, tenant_id, expires_at)
    WHERE consumed_at IS NULL;

CREATE INDEX ix_ac_mobile_auth_request_identity
    ON public.ac_mobile_auth_request(identity_id, created_at DESC)
    WHERE identity_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE
ON TABLE public.ac_tenant_login_domain,
         public.ac_mobile_auth_request,
         public.ac_device_session
TO akshaconnect;

DO $$
DECLARE
    v_count bigint;
BEGIN
    IF to_regclass('public.ac_tenant_login_domain') IS NULL
       OR to_regclass('public.ac_mobile_auth_request') IS NULL THEN
        RAISE EXCEPTION 'Mobile auth tables were not created';
    END IF;

    SELECT count(*) INTO v_count
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ac_device_session'
      AND column_name = 'identity_provider';

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Expected ac_device_session.identity_provider after migration';
    END IF;

    SELECT count(*) INTO v_count
    FROM public.ac_tenant_login_domain;

    IF v_count <> 0 THEN
        RAISE EXCEPTION 'Product migration must not seed customer login domains';
    END IF;
END
$$;
