'use strict';

const { boundaryError } = require('../core/boundaryError');

function clean(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function providerTenantSubject(tenantId) {
  return String(tenantId || '').trim().toUpperCase();
}

function providerIdentitySubject(tenantId, userId) {
  return `${providerTenantSubject(tenantId)}:${Number(userId)}`;
}

function createAkshaErpSsoRepository(pool) {
  if (!pool || typeof pool.connect !== 'function') {
    throw new TypeError('A PostgreSQL pool is required');
  }

  async function provisionIdentity({
    tenantId,
    organizationId,
    branchId,
    userId,
    displayName,
    primaryEmail,
    username,
    email,
    akshamail,
  }) {
    const client = await pool.connect();
    const providerCode = 'AKSHAERP';
    const tenantSubject = providerTenantSubject(tenantId);
    const identitySubject = providerIdentitySubject(tenantId, userId);

    try {
      await client.query('BEGIN');

      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`${providerCode}|${identitySubject}`]
      );

      const tenantResult = await client.query(`
        SELECT
          t.tenant_id,
          t.tenant_code,
          t.tenant_name,
          t.status AS tenant_status
        FROM ac_tenant_provider_link p
        JOIN ac_tenant t ON t.tenant_id = p.tenant_id
        WHERE p.provider_code = $1
          AND p.external_subject = $2
          AND p.status = 'ACTIVE'
          AND t.status = 'ACTIVE'
        LIMIT 1
        FOR SHARE
      `, [providerCode, tenantSubject]);

      const tenant = tenantResult.rows?.[0];
      if (!tenant) {
        throw boundaryError(
          'AKSHAERP_TENANT_MAPPING_NOT_FOUND',
          'No active AkshaConnect tenant mapping exists for this AkshaERP tenant.',
          403
        );
      }

      const workspaceResult = await client.query(`
        SELECT
          workspace_id,
          workspace_code,
          workspace_name,
          default_flag,
          status
        FROM ac_workspace
        WHERE tenant_id = $1
          AND status = 'ACTIVE'
        ORDER BY
          CASE WHEN default_flag = 'Y' THEN 0 ELSE 1 END,
          workspace_name,
          workspace_id
        FOR SHARE
      `, [tenant.tenant_id]);

      const tenantWorkspaces = workspaceResult.rows || [];
      const defaultWorkspace = tenantWorkspaces.find((row) => row.default_flag === 'Y');

      if (!defaultWorkspace) {
        throw boundaryError(
          'AKSHAERP_DEFAULT_WORKSPACE_NOT_FOUND',
          'The mapped AkshaConnect tenant has no active default workspace.',
          500
        );
      }

      const linkResult = await client.query(`
        SELECT
          p.identity_provider_link_id,
          p.identity_id,
          i.display_name,
          i.primary_email,
          i.status AS identity_status
        FROM ac_identity_provider_link p
        JOIN ac_identity i ON i.identity_id = p.identity_id
        WHERE p.provider_code = $1
          AND p.external_subject = $2
        LIMIT 1
        FOR UPDATE
      `, [providerCode, identitySubject]);

      let identityId;
      let createdIdentity = false;

      const metadata = JSON.stringify({
        erp_tenant_id: clean(tenantId),
        erp_organization_id: clean(organizationId),
        erp_branch_id: clean(branchId),
        erp_user_id: Number(userId),
        username: clean(username),
        email: clean(email),
        akshamail: clean(akshamail),
      });

      if (linkResult.rowCount) {
        const current = linkResult.rows[0];
        identityId = current.identity_id;

        if (current.identity_status !== 'ACTIVE') {
          throw boundaryError(
            'AKSHAERP_IDENTITY_INACTIVE',
            'The linked AkshaConnect identity is not active.',
            403
          );
        }

        await client.query(`
          UPDATE ac_identity
          SET display_name = $2,
              primary_email = $3,
              updated_at = NOW()
          WHERE identity_id = $1
        `, [identityId, displayName, primaryEmail]);

        await client.query(`
          UPDATE ac_identity_provider_link
          SET provider_metadata = $3::jsonb
          WHERE provider_code = $1
            AND external_subject = $2
        `, [providerCode, identitySubject, metadata]);
      } else {
        const identityResult = await client.query(`
          INSERT INTO ac_identity (
            display_name,
            primary_email,
            status,
            created_at,
            updated_at
          )
          VALUES ($1, $2, 'ACTIVE', NOW(), NOW())
          RETURNING identity_id
        `, [displayName, primaryEmail]);

        identityId = identityResult.rows[0].identity_id;
        createdIdentity = true;

        await client.query(`
          INSERT INTO ac_identity_provider_link (
            identity_id,
            provider_code,
            external_subject,
            provider_metadata,
            created_at
          )
          VALUES ($1, $2, $3, $4::jsonb, NOW())
        `, [identityId, providerCode, identitySubject, metadata]);
      }

      let membershipsResult = await client.query(`
        SELECT
          wm.workspace_member_id,
          wm.workspace_id,
          wm.member_role,
          wm.status,
          w.workspace_code,
          w.workspace_name,
          w.default_flag
        FROM ac_workspace_member wm
        JOIN ac_workspace w ON w.workspace_id = wm.workspace_id
        WHERE wm.identity_id = $1
          AND w.tenant_id = $2
          AND wm.status = 'ACTIVE'
          AND w.status = 'ACTIVE'
        ORDER BY
          CASE WHEN w.default_flag = 'Y' THEN 0 ELSE 1 END,
          w.workspace_name,
          wm.workspace_member_id
        FOR UPDATE
      `, [identityId, tenant.tenant_id]);

      let createdMembership = false;

      if (!membershipsResult.rowCount) {
        const insertedMember = await client.query(`
          INSERT INTO ac_workspace_member (
            workspace_id,
            identity_id,
            member_role,
            status,
            joined_at,
            created_at,
            updated_at
          )
          VALUES ($1, $2, 'MEMBER', 'ACTIVE', NOW(), NOW(), NOW())
          RETURNING workspace_member_id, workspace_id, member_role, status
        `, [defaultWorkspace.workspace_id, identityId]);

        createdMembership = true;
        membershipsResult = {
          rows: [{
            ...insertedMember.rows[0],
            workspace_code: defaultWorkspace.workspace_code,
            workspace_name: defaultWorkspace.workspace_name,
            default_flag: defaultWorkspace.default_flag,
          }],
          rowCount: 1,
        };
      }

      const memberships = membershipsResult.rows;
      const activeMembership =
        memberships.find((row) => row.workspace_id === defaultWorkspace.workspace_id) ||
        memberships[0];

      if (!activeMembership) {
        throw boundaryError(
          'AKSHAERP_WORKSPACE_MEMBERSHIP_NOT_FOUND',
          'No active AkshaConnect workspace membership is available.',
          403
        );
      }

      await client.query('COMMIT');

      return Object.freeze({
        identity_id: identityId,
        display_name: displayName,
        primary_email: primaryEmail,
        tenant_id: tenant.tenant_id,
        tenant_code: tenant.tenant_code,
        tenant_name: tenant.tenant_name,
        workspace_id: activeMembership.workspace_id,
        workspace_code: activeMembership.workspace_code,
        workspace_name: activeMembership.workspace_name,
        workspace_member_id: activeMembership.workspace_member_id,
        member_role: activeMembership.member_role,
        workspaces: Object.freeze(memberships.map((row) => Object.freeze({
          workspace_id: row.workspace_id,
          workspace_code: row.workspace_code,
          workspace_name: row.workspace_name,
          workspace_member_id: row.workspace_member_id,
          member_role: row.member_role,
          default_flag: row.default_flag,
        }))),
        created_identity: createdIdentity,
        created_membership: createdMembership,
        provider_code: providerCode,
        external_subject: identitySubject,
      });
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}

      if (
        error?.code === '23505' &&
        error?.constraint === 'uq_ac_identity_primary_email_ci'
      ) {
        throw boundaryError(
          'AKSHAERP_IDENTITY_EMAIL_CONFLICT',
          'This ERP email is already linked to a different AkshaConnect identity and requires administrator review.',
          409
        );
      }

      throw error;
    } finally {
      client.release();
    }
  }

  return Object.freeze({ provisionIdentity });
}

module.exports = {
  providerTenantSubject,
  providerIdentitySubject,
  createAkshaErpSsoRepository,
};
