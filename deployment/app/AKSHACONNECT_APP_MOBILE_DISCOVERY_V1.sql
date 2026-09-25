-- AkshaERP internal tenant mobile discovery provisioning V1
-- Run only after 202609251300__acn_mobile_multi_company_auth_v1.sql.

DO $$
DECLARE
    v_tenant_id uuid;
BEGIN
    IF current_database() <> 'akshaconnect'
       AND current_database() NOT LIKE 'akshaconnect_trial_%' THEN
        RAISE EXCEPTION 'Expected database akshaconnect, found %', current_database();
    END IF;

    SELECT tenant_id INTO v_tenant_id
    FROM public.ac_tenant
    WHERE tenant_code = 'AKSHAERP_INTERNAL'
      AND status = 'ACTIVE'
    LIMIT 1;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'AKSHAERP_INTERNAL active tenant not found';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.ac_tenant_provider_link
        WHERE tenant_id = v_tenant_id
          AND provider_code = 'AKSHAERP'
          AND external_subject = 'APP'
          AND status = 'ACTIVE'
    ) THEN
        RAISE EXCEPTION 'Expected AKSHAERP / APP tenant provider link not found';
    END IF;

    INSERT INTO public.ac_tenant_login_domain (
        tenant_id,
        email_domain,
        provider_code,
        authorization_origin,
        status
    )
    VALUES (
        v_tenant_id,
        'akshaerp.com',
        'AKSHAERP',
        'https://app.akshaerp.com',
        'ACTIVE'
    )
    ON CONFLICT (tenant_id, email_domain, provider_code)
    DO UPDATE SET
        authorization_origin = EXCLUDED.authorization_origin,
        status = 'ACTIVE',
        updated_at = NOW();
END
$$;

SELECT
    t.tenant_code,
    d.email_domain,
    d.provider_code,
    d.authorization_origin,
    d.status
FROM public.ac_tenant_login_domain d
JOIN public.ac_tenant t ON t.tenant_id = d.tenant_id
WHERE t.tenant_code = 'AKSHAERP_INTERNAL'
ORDER BY d.email_domain, d.provider_code;
