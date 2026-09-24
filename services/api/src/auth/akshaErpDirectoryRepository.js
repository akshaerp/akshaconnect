'use strict';

const { boundaryError } = require('../core/boundaryError');

function clean(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function positiveInt(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function providerTenantSubject(value) {
  return String(value || '').trim().toUpperCase();
}

function providerIdentitySubject(tenantId, userId) {
  return `${providerTenantSubject(tenantId)}:${Number(userId)}`;
}

function normalizedMetadata(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

function displayNameFor(user = {}) {
  const explicit = clean(user.display_name ?? user.displayName);
  if (explicit) return explicit;

  const firstName = clean(user.first_name ?? user.firstName);
  const lastName = clean(user.last_name ?? user.lastName);
  const fullName = [firstName, lastName].filter(Boolean).join(' ');
  return (
    fullName ||
    clean(user.username) ||
    clean(user.akshamail) ||
    clean(user.email) ||
    null
  );
}

function primaryEmailFor(user = {}) {
  return clean(user.akshamail) || clean(user.email) || null;
}

function createAkshaErpDirectoryRepository(pool) {
  if (!pool || typeof pool.query !== 'function' || typeof pool.connect !== 'function') {
    throw new TypeError('A PostgreSQL pool is required');
  }

  async function getTrustedDirectoryContext({
    identityId,
    workspaceId,
    workspaceMemberId,
  }) {
    const result = await pool.query(`
      SELECT
        w.tenant_id AS connect_tenant_id,
        tp.external_subject AS erp_tenant_id,
        ip.provider_metadata
      FROM ac_workspace_member wm
      JOIN ac_workspace w
        ON w.workspace_id = wm.workspace_id
       AND w.status = 'ACTIVE'
      JOIN ac_tenant t
        ON t.tenant_id = w.tenant_id
       AND t.status = 'ACTIVE'
      JOIN ac_identity i
        ON i.identity_id = wm.identity_id
       AND i.status = 'ACTIVE'
      JOIN ac_identity_provider_link ip
        ON ip.identity_id = i.identity_id
       AND ip.provider_code = 'AKSHAERP'
      JOIN ac_tenant_provider_link tp
        ON tp.tenant_id = w.tenant_id
       AND tp.provider_code = 'AKSHAERP'
       AND tp.status = 'ACTIVE'
      WHERE wm.workspace_id = $1
        AND wm.workspace_member_id = $2
        AND wm.identity_id = $3
        AND wm.status = 'ACTIVE'
      LIMIT 1
    `, [workspaceId, workspaceMemberId, identityId]);

    const row = result.rows?.[0];
    if (!row) return null;

    const metadata = normalizedMetadata(row.provider_metadata);
    return {
      connect_tenant_id: row.connect_tenant_id,
      erp_tenant_id:
        clean(metadata.erp_tenant_id) ||
        clean(row.erp_tenant_id),
      organization_id:
        positiveInt(metadata.erp_organization_id),
      requester_user_id:
        positiveInt(metadata.erp_user_id),
    };
  }

  async function provisionDirectoryUser({
    connectTenantId,
    workspaceId,
    erpTenantId,
    organizationId,
    user,
  }) {
    const erpUserId = positiveInt(user?.user_id ?? user?.userId);
    const displayName = displayNameFor(user);
    const primaryEmail = primaryEmailFor(user);

    if (!connectTenantId || !workspaceId || !erpTenantId || !erpUserId || !displayName) {
      throw boundaryError(
        'AKSHAERP_DIRECTORY_USER_INVALID',
        'AkshaERP directory returned an incomplete user.',
        502
      );
    }

    const providerCode = 'AKSHAERP';
    const tenantSubject = providerTenantSubject(erpTenantId);
    const identitySubject = providerIdentitySubject(tenantSubject, erpUserId);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`${providerCode}|${identitySubject}`]
      );

      const workspaceResult = await client.query(`
        SELECT
          w.workspace_id,
          w.tenant_id
        FROM ac_workspace w
        JOIN ac_tenant t
          ON t.tenant_id = w.tenant_id
         AND t.status = 'ACTIVE'
        JOIN ac_tenant_provider_link tp
          ON tp.tenant_id = w.tenant_id
         AND tp.provider_code = $3
         AND tp.external_subject = $4
         AND tp.status = 'ACTIVE'
        WHERE w.workspace_id = $1
          AND w.tenant_id = $2
          AND w.status = 'ACTIVE'
        LIMIT 1
        FOR SHARE
      `, [
        workspaceId,
        connectTenantId,
        providerCode,
        tenantSubject,
      ]);

      if (!workspaceResult.rowCount) {
        throw boundaryError(
          'AKSHAERP_DIRECTORY_WORKSPACE_DENIED',
          'The requested workspace is outside the mapped AkshaERP tenant.',
          403
        );
      }

      const linkResult = await client.query(`
        SELECT
          p.identity_id,
          i.status AS identity_status
        FROM ac_identity_provider_link p
        JOIN ac_identity i
          ON i.identity_id = p.identity_id
        WHERE p.provider_code = $1
          AND p.external_subject = $2
        LIMIT 1
        FOR UPDATE
      `, [providerCode, identitySubject]);

      const metadata = JSON.stringify({
        erp_tenant_id: tenantSubject,
        erp_organization_id: positiveInt(organizationId),
        erp_user_id: erpUserId,
        username: clean(user?.username),
        email: clean(user?.email),
        akshamail: clean(user?.akshamail),
      });

      let identityId;
      let createdIdentity = false;

      if (linkResult.rowCount) {
        const current = linkResult.rows[0];

        if (current.identity_status !== 'ACTIVE') {
          await client.query('ROLLBACK');
          return {
            available: false,
            reason: 'IDENTITY_INACTIVE',
          };
        }

        identityId = current.identity_id;

        await client.query(`
          UPDATE ac_identity
          SET
            display_name = $2,
            primary_email = $3,
            updated_at = NOW()
          WHERE identity_id = $1
        `, [identityId, displayName, primaryEmail]);

        await client.query(`
          UPDATE ac_identity_provider_link
          SET provider_metadata =
            COALESCE(provider_metadata, '{}'::jsonb) || $3::jsonb
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
        `, [
          identityId,
          providerCode,
          identitySubject,
          metadata,
        ]);
      }

      const membershipResult = await client.query(`
        SELECT
          workspace_member_id,
          member_role,
          status
        FROM ac_workspace_member
        WHERE workspace_id = $1
          AND identity_id = $2
        LIMIT 1
        FOR UPDATE
      `, [workspaceId, identityId]);

      let workspaceMemberId;
      let memberRole;
      let createdMembership = false;

      if (membershipResult.rowCount) {
        const membership = membershipResult.rows[0];
        if (membership.status !== 'ACTIVE') {
          await client.query('COMMIT');
          return {
            available: false,
            reason: 'MEMBERSHIP_INACTIVE',
          };
        }

        workspaceMemberId = membership.workspace_member_id;
        memberRole = membership.member_role;
      } else {
        const inserted = await client.query(`
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
          RETURNING workspace_member_id, member_role
        `, [workspaceId, identityId]);

        workspaceMemberId = inserted.rows[0].workspace_member_id;
        memberRole = inserted.rows[0].member_role;
        createdMembership = true;
      }

      await client.query('COMMIT');

      return {
        available: true,
        workspace_member_id: workspaceMemberId,
        identity_id: identityId,
        display_name: displayName,
        primary_email: primaryEmail,
        member_role: memberRole,
        directory_provider: 'AKSHAERP',
        external_user_id: erpUserId,
        created_identity: createdIdentity,
        created_membership: createdMembership,
      };
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}

      if (
        error?.code === '23505' &&
        error?.constraint === 'uq_ac_identity_primary_email_ci'
      ) {
        throw boundaryError(
          'AKSHAERP_DIRECTORY_IDENTITY_EMAIL_CONFLICT',
          'This ERP email is already linked to a different AkshaConnect identity and requires administrator review.',
          409
        );
      }

      throw error;
    } finally {
      client.release();
    }
  }

  return Object.freeze({
    getTrustedDirectoryContext,
    provisionDirectoryUser,
  });
}

module.exports = {
  providerTenantSubject,
  providerIdentitySubject,
  createAkshaErpDirectoryRepository,
};
