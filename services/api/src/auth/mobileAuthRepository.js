'use strict';

function createMobileAuthRepository(db) {
  if (!db || typeof db.query !== 'function' || typeof db.connect !== 'function') {
    throw new TypeError('A PostgreSQL pool is required');
  }

  async function discoverByEmailDomain(emailDomain) {
    const result = await db.query(`
      SELECT
        t.tenant_id,
        t.tenant_code,
        t.tenant_name,
        d.provider_code,
        d.authorization_origin
      FROM ac_tenant_login_domain d
      JOIN ac_tenant t
        ON t.tenant_id = d.tenant_id
       AND t.status = 'ACTIVE'
      JOIN ac_tenant_provider_link p
        ON p.tenant_id = d.tenant_id
       AND p.provider_code = d.provider_code
       AND p.status = 'ACTIVE'
      WHERE d.email_domain = $1
        AND d.status = 'ACTIVE'
      ORDER BY t.tenant_name, d.provider_code
    `, [emailDomain]);

    return result.rows || [];
  }

  async function findDiscoveryTarget({ tenantId, emailDomain, providerCode }) {
    const result = await db.query(`
      SELECT
        t.tenant_id,
        t.tenant_code,
        t.tenant_name,
        d.provider_code,
        d.authorization_origin,
        p.external_subject AS provider_tenant_subject
      FROM ac_tenant_login_domain d
      JOIN ac_tenant t
        ON t.tenant_id = d.tenant_id
       AND t.status = 'ACTIVE'
      JOIN ac_tenant_provider_link p
        ON p.tenant_id = d.tenant_id
       AND p.provider_code = d.provider_code
       AND p.status = 'ACTIVE'
      WHERE d.tenant_id = $1
        AND d.email_domain = $2
        AND d.provider_code = $3
        AND d.status = 'ACTIVE'
      LIMIT 1
    `, [tenantId, emailDomain, providerCode]);

    return result.rows?.[0] || null;
  }

  async function createAuthRequest({
    tenantId,
    providerCode,
    requestedEmail,
    redirectUri,
    stateValue,
    exchangeSecretHash,
    devicePlatform,
    deviceLabel,
    expiresAt,
    clientIpHash,
    userAgentHash,
  }) {
    const result = await db.query(`
      INSERT INTO ac_mobile_auth_request (
        tenant_id,
        provider_code,
        requested_email,
        redirect_uri,
        state_value,
        exchange_secret_hash,
        device_platform,
        device_label,
        expires_at,
        client_ip_hash,
        user_agent_hash
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING auth_request_id, created_at, expires_at
    `, [
      tenantId,
      providerCode,
      requestedEmail,
      redirectUri,
      stateValue,
      exchangeSecretHash,
      devicePlatform,
      deviceLabel,
      expiresAt,
      clientIpHash,
      userAgentHash,
    ]);

    return result.rows[0];
  }

  async function findActiveAuthRequest(authRequestId) {
    const result = await db.query(`
      SELECT
        r.auth_request_id,
        r.tenant_id,
        r.provider_code,
        r.requested_email,
        r.redirect_uri,
        r.state_value,
        r.exchange_secret_hash,
        r.device_platform,
        r.device_label,
        r.created_at,
        r.expires_at,
        r.authorized_at,
        r.consumed_at,
        p.external_subject AS provider_tenant_subject,
        t.tenant_code,
        t.tenant_name
      FROM ac_mobile_auth_request r
      JOIN ac_tenant t
        ON t.tenant_id = r.tenant_id
       AND t.status = 'ACTIVE'
      JOIN ac_tenant_provider_link p
        ON p.tenant_id = r.tenant_id
       AND p.provider_code = r.provider_code
       AND p.status = 'ACTIVE'
      WHERE r.auth_request_id = $1
        AND r.expires_at > NOW()
        AND r.consumed_at IS NULL
      LIMIT 1
    `, [authRequestId]);

    return result.rows?.[0] || null;
  }

  async function authorizeRequest({
    authRequestId,
    authorizationCodeHash,
    identityId,
    workspaceId,
    workspaceMemberId,
  }) {
    const result = await db.query(`
      UPDATE ac_mobile_auth_request
      SET authorization_code_hash = $2,
          identity_id = $3,
          workspace_id = $4,
          workspace_member_id = $5,
          authorized_at = NOW()
      WHERE auth_request_id = $1
        AND expires_at > NOW()
        AND consumed_at IS NULL
        AND authorized_at IS NULL
      RETURNING
        auth_request_id,
        redirect_uri,
        state_value,
        expires_at
    `, [
      authRequestId,
      authorizationCodeHash,
      identityId,
      workspaceId,
      workspaceMemberId,
    ]);

    return result.rows?.[0] || null;
  }

  async function consumeAuthorization({
    authRequestId,
    authorizationCodeHash,
    exchangeSecretHash,
    stateValue,
  }) {
    const client = await db.connect();

    try {
      await client.query('BEGIN');

      const result = await client.query(`
        SELECT
          r.auth_request_id,
          r.tenant_id,
          r.provider_code,
          r.requested_email,
          r.redirect_uri,
          r.state_value,
          r.device_platform,
          r.device_label,
          r.identity_id,
          r.workspace_id,
          r.workspace_member_id,
          r.expires_at,
          t.tenant_code,
          t.tenant_name,
          i.display_name,
          i.primary_email,
          wm.member_role,
          w.workspace_code,
          w.workspace_name
        FROM ac_mobile_auth_request r
        JOIN ac_tenant t ON t.tenant_id = r.tenant_id
        JOIN ac_identity i ON i.identity_id = r.identity_id
        JOIN ac_workspace w ON w.workspace_id = r.workspace_id
        JOIN ac_workspace_member wm
          ON wm.workspace_id = r.workspace_id
         AND wm.workspace_member_id = r.workspace_member_id
         AND wm.identity_id = r.identity_id
        WHERE r.auth_request_id = $1
          AND r.authorization_code_hash = $2
          AND r.exchange_secret_hash = $3
          AND r.state_value = $4
          AND r.authorized_at IS NOT NULL
          AND r.consumed_at IS NULL
          AND r.expires_at > NOW()
          AND t.status = 'ACTIVE'
          AND i.status = 'ACTIVE'
          AND w.status = 'ACTIVE'
          AND wm.status = 'ACTIVE'
        LIMIT 1
        FOR UPDATE OF r
      `, [
        authRequestId,
        authorizationCodeHash,
        exchangeSecretHash,
        stateValue,
      ]);

      const row = result.rows?.[0] || null;
      if (!row) {
        await client.query('ROLLBACK');
        return null;
      }

      await client.query(`
        UPDATE ac_mobile_auth_request
        SET consumed_at = NOW()
        WHERE auth_request_id = $1
      `, [authRequestId]);

      await client.query('COMMIT');
      return row;
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      throw error;
    } finally {
      client.release();
    }
  }

  async function listIdentityWorkspaces({ identityId, tenantId }) {
    const result = await db.query(`
      SELECT
        w.workspace_id,
        w.workspace_code,
        w.workspace_name,
        w.default_flag,
        wm.workspace_member_id,
        wm.member_role
      FROM ac_workspace_member wm
      JOIN ac_workspace w
        ON w.workspace_id = wm.workspace_id
       AND w.status = 'ACTIVE'
      WHERE wm.identity_id = $1
        AND wm.status = 'ACTIVE'
        AND w.tenant_id = $2
      ORDER BY
        CASE WHEN w.default_flag = 'Y' THEN 0 ELSE 1 END,
        w.workspace_name,
        wm.workspace_member_id
    `, [identityId, tenantId]);

    return result.rows || [];
  }

  async function createDeviceSession({
    workspaceId,
    workspaceMemberId,
    identityId,
    identityProvider,
    tokenHash,
    expiresAt,
    devicePlatform,
    deviceLabel,
    userAgentHash,
    clientIpHash,
  }) {
    const result = await db.query(`
      INSERT INTO ac_device_session (
        workspace_id,
        workspace_member_id,
        identity_id,
        identity_provider,
        device_token_hash,
        device_platform,
        device_label,
        expires_at,
        user_agent_hash,
        client_ip_hash
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING device_session_id, created_at, last_seen_at, expires_at
    `, [
      workspaceId,
      workspaceMemberId,
      identityId,
      identityProvider,
      tokenHash,
      devicePlatform,
      deviceLabel,
      expiresAt,
      userAgentHash,
      clientIpHash,
    ]);

    return result.rows[0];
  }

  async function findActiveDeviceSession(tokenHash) {
    const result = await db.query(`
      SELECT
        d.device_session_id,
        d.workspace_id,
        d.workspace_member_id,
        d.identity_id,
        d.identity_provider,
        d.device_platform,
        d.device_label,
        d.created_at,
        d.expires_at,
        i.display_name,
        i.primary_email,
        i.status AS identity_status,
        w.workspace_code,
        w.workspace_name,
        w.status AS workspace_status,
        w.tenant_id,
        t.tenant_code,
        t.tenant_name,
        t.status AS tenant_status,
        wm.member_role,
        wm.status AS member_status,
        c.credential_status,
        c.password_changed_at
      FROM ac_device_session d
      JOIN ac_identity i ON i.identity_id = d.identity_id
      JOIN ac_workspace w ON w.workspace_id = d.workspace_id
      LEFT JOIN ac_tenant t ON t.tenant_id = w.tenant_id
      JOIN ac_workspace_member wm
        ON wm.workspace_id = d.workspace_id
       AND wm.workspace_member_id = d.workspace_member_id
       AND wm.identity_id = d.identity_id
      LEFT JOIN ac_local_credential c ON c.identity_id = d.identity_id
      WHERE d.device_token_hash = $1
        AND d.revoked_at IS NULL
        AND d.expires_at > NOW()
        AND (
          d.identity_provider <> 'LOCAL'
          OR (
            c.credential_status = 'ACTIVE'
            AND (c.password_changed_at IS NULL OR d.created_at > c.password_changed_at)
          )
        )
      LIMIT 1
    `, [tokenHash]);

    return result.rows?.[0] || null;
  }

  async function touchDeviceSession({ deviceSessionId, expiresAt }) {
    const result = await db.query(`
      UPDATE ac_device_session
      SET last_seen_at = NOW(),
          expires_at = $2
      WHERE device_session_id = $1
        AND revoked_at IS NULL
      RETURNING expires_at
    `, [deviceSessionId, expiresAt]);

    return result.rows?.[0] || null;
  }

  async function revokeDeviceSession(tokenHash) {
    const result = await db.query(`
      UPDATE ac_device_session
      SET revoked_at = COALESCE(revoked_at, NOW())
      WHERE device_token_hash = $1
      RETURNING device_session_id
    `, [tokenHash]);

    return Boolean(result.rowCount);
  }

  return Object.freeze({
    discoverByEmailDomain,
    findDiscoveryTarget,
    createAuthRequest,
    findActiveAuthRequest,
    authorizeRequest,
    consumeAuthorization,
    listIdentityWorkspaces,
    createDeviceSession,
    findActiveDeviceSession,
    touchDeviceSession,
    revokeDeviceSession,
  });
}

module.exports = {
  createMobileAuthRepository,
};
