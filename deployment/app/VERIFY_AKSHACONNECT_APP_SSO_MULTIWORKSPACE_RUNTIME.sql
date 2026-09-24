-- Runtime JIT verification after at least one successful APP SSO login.

BEGIN;
SET TRANSACTION READ ONLY;

SELECT t.tenant_code, t.tenant_name, p.provider_code, p.external_subject,
       p.status AS provider_link_status
FROM ac_tenant_provider_link p
JOIN ac_tenant t ON t.tenant_id = p.tenant_id
WHERE p.provider_code = 'AKSHAERP'
  AND p.external_subject = 'APP';

SELECT p.external_subject, i.identity_id, i.display_name, i.primary_email,
       i.status AS identity_status
FROM ac_identity_provider_link p
JOIN ac_identity i ON i.identity_id = p.identity_id
WHERE p.provider_code = 'AKSHAERP'
  AND p.external_subject LIKE 'APP:%'
ORDER BY p.external_subject;

SELECT p.external_subject, t.tenant_code, w.workspace_code, w.workspace_name,
       w.default_flag, wm.workspace_member_id, wm.member_role,
       wm.status AS membership_status
FROM ac_identity_provider_link p
JOIN ac_identity i ON i.identity_id = p.identity_id
JOIN ac_workspace_member wm ON wm.identity_id = i.identity_id
JOIN ac_workspace w ON w.workspace_id = wm.workspace_id
LEFT JOIN ac_tenant t ON t.tenant_id = w.tenant_id
WHERE p.provider_code = 'AKSHAERP'
  AND p.external_subject LIKE 'APP:%'
ORDER BY p.external_subject, w.default_flag DESC, w.workspace_name;

SELECT p.external_subject, s.identity_provider,
       count(*) FILTER (WHERE s.revoked_at IS NULL AND s.expires_at > NOW()) AS active_sessions,
       max(s.last_seen_at) AS last_seen_at
FROM ac_identity_provider_link p
LEFT JOIN ac_session s ON s.identity_id = p.identity_id
WHERE p.provider_code = 'AKSHAERP'
  AND p.external_subject LIKE 'APP:%'
GROUP BY p.external_subject, s.identity_provider
ORDER BY p.external_subject, s.identity_provider;

SELECT 'AKSHACONNECT_APP_SSO_MULTIWORKSPACE_RUNTIME_VERIFY=PASS' AS result;

ROLLBACK;
