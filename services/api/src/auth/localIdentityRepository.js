'use strict';

function createLocalIdentityRepository(db) {
  if (!db || typeof db.query !== 'function') {
    throw new TypeError('A PostgreSQL query client is required');
  }

  async function findLocalLogin({ workspaceCode, loginName, password }) {
    const result = await db.query(`
      SELECT
        i.identity_id,
        i.display_name,
        i.primary_email,
        i.status AS identity_status,
        w.workspace_id,
        w.workspace_code,
        w.workspace_name,
        w.status AS workspace_status,
        wm.workspace_member_id,
        wm.member_role,
        wm.status AS member_status,
        c.credential_status,
        c.failed_attempts,
        c.locked_until,
        (c.password_hash = crypt($3, c.password_hash)) AS password_matches
      FROM ac_identity_provider_link p
      JOIN ac_identity i
        ON i.identity_id = p.identity_id
      JOIN ac_workspace_member wm
        ON wm.identity_id = i.identity_id
      JOIN ac_workspace w
        ON w.workspace_id = wm.workspace_id
      JOIN ac_local_credential c
        ON c.identity_id = i.identity_id
      WHERE p.provider_code = 'LOCAL'
        AND LOWER(p.external_subject) = LOWER($2)
        AND UPPER(w.workspace_code) = UPPER($1)
      LIMIT 1
    `, [workspaceCode, loginName, password]);

    return result.rows?.[0] || null;
  }

  async function recordFailedLogin(identityId) {
    await db.query(`
      UPDATE ac_local_credential
      SET
        failed_attempts = failed_attempts + 1,
        locked_until = CASE
          WHEN failed_attempts + 1 >= 5
            THEN NOW() + INTERVAL '15 minutes'
          ELSE locked_until
        END,
        updated_at = NOW()
      WHERE identity_id = $1
    `, [identityId]);
  }

  async function resetFailedLogin(identityId) {
    await db.query(`
      UPDATE ac_local_credential
      SET
        failed_attempts = 0,
        locked_until = NULL,
        updated_at = NOW()
      WHERE identity_id = $1
    `, [identityId]);
  }

  async function changePassword({
    identityId,
    currentPassword,
    newPassword,
    currentSessionId,
  }) {
    const result = await db.query(`
      WITH verified AS (
        SELECT c.identity_id
        FROM ac_local_credential c
        WHERE c.identity_id = $1
          AND c.credential_status = 'ACTIVE'
          AND c.password_hash = crypt($2, c.password_hash)
      ),
      updated AS (
        UPDATE ac_local_credential c
        SET
          password_hash = crypt($3, gen_salt('bf', 12)),
          failed_attempts = 0,
          locked_until = NULL,
          password_changed_at = NOW(),
          updated_at = NOW()
        FROM verified v
        WHERE c.identity_id = v.identity_id
        RETURNING c.identity_id, c.password_changed_at
      ),
      revoked AS (
        UPDATE ac_session s
        SET revoked_at = COALESCE(s.revoked_at, NOW())
        FROM updated u
        WHERE s.identity_id = u.identity_id
          AND s.session_id <> $4
          AND s.revoked_at IS NULL
        RETURNING s.session_id
      )
      SELECT
        (SELECT identity_id FROM updated) AS identity_id,
        (SELECT password_changed_at FROM updated) AS password_changed_at,
        COALESCE(
          (SELECT COUNT(*)::INTEGER FROM revoked),
          0
        ) AS revoked_session_count
    `, [
      identityId,
      currentPassword,
      newPassword,
      currentSessionId,
    ]);

    const row = result.rows?.[0] || null;
    if (!row?.identity_id) return null;

    return {
      identity_id: row.identity_id,
      password_changed_at: row.password_changed_at,
      revoked_session_count: Number(row.revoked_session_count || 0),
    };
  }

  async function createSession({
    workspaceId,
    workspaceMemberId,
    identityId,
    tokenHash,
    expiresAt,
    userAgentHash,
    clientIpHash,
  }) {
    const result = await db.query(`
      INSERT INTO ac_session (
        workspace_id,
        workspace_member_id,
        identity_id,
        token_hash,
        expires_at,
        user_agent_hash,
        client_ip_hash
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING session_id, created_at, expires_at
    `, [
      workspaceId,
      workspaceMemberId,
      identityId,
      tokenHash,
      expiresAt,
      userAgentHash,
      clientIpHash,
    ]);

    return result.rows[0];
  }

  async function findActiveSession(tokenHash) {
    const result = await db.query(`
      SELECT
        s.session_id,
        s.workspace_id,
        s.workspace_member_id,
        s.identity_id,
        s.expires_at,
        i.display_name,
        i.primary_email,
        i.status AS identity_status,
        w.workspace_code,
        w.workspace_name,
        w.status AS workspace_status,
        wm.member_role,
        wm.status AS member_status
      FROM ac_session s
      JOIN ac_identity i
        ON i.identity_id = s.identity_id
      JOIN ac_workspace w
        ON w.workspace_id = s.workspace_id
      JOIN ac_workspace_member wm
        ON wm.workspace_id = s.workspace_id
       AND wm.workspace_member_id = s.workspace_member_id
       AND wm.identity_id = s.identity_id
      WHERE s.token_hash = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > NOW()
      LIMIT 1
    `, [tokenHash]);

    return result.rows?.[0] || null;
  }

  async function touchSession(sessionId) {
    await db.query(`
      UPDATE ac_session
      SET last_seen_at = NOW()
      WHERE session_id = $1
        AND revoked_at IS NULL
    `, [sessionId]);
  }

  async function revokeSession(tokenHash) {
    const result = await db.query(`
      UPDATE ac_session
      SET revoked_at = COALESCE(revoked_at, NOW())
      WHERE token_hash = $1
      RETURNING session_id
    `, [tokenHash]);

    return Boolean(result.rowCount);
  }


  async function createDeviceSession({
    workspaceId,
    workspaceMemberId,
    identityId,
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
        device_token_hash,
        device_platform,
        device_label,
        expires_at,
        user_agent_hash,
        client_ip_hash
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9
      )
      RETURNING
        device_session_id,
        created_at,
        last_seen_at,
        expires_at
    `, [
      workspaceId,
      workspaceMemberId,
      identityId,
      tokenHash,
      devicePlatform,
      deviceLabel,
      expiresAt,
      userAgentHash,
      clientIpHash,
    ]);

    return result.rows[0];
  }

  async function findActiveDeviceSession(
    tokenHash
  ) {
    const result = await db.query(`
      SELECT
        d.device_session_id,
        d.workspace_id,
        d.workspace_member_id,
        d.identity_id,
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

        wm.member_role,
        wm.status AS member_status,

        c.credential_status,
        c.password_changed_at

      FROM ac_device_session d

      JOIN ac_identity i
        ON i.identity_id = d.identity_id

      JOIN ac_workspace w
        ON w.workspace_id = d.workspace_id

      JOIN ac_workspace_member wm
        ON wm.workspace_id = d.workspace_id
       AND wm.workspace_member_id =
           d.workspace_member_id
       AND wm.identity_id = d.identity_id

      JOIN ac_local_credential c
        ON c.identity_id = d.identity_id

      WHERE d.device_token_hash = $1
        AND d.revoked_at IS NULL
        AND d.expires_at > NOW()
        AND c.credential_status = 'ACTIVE'
        AND (
          c.password_changed_at IS NULL
          OR d.created_at > c.password_changed_at
        )

      LIMIT 1
    `, [tokenHash]);

    return result.rows?.[0] || null;
  }

  async function touchDeviceSession({
    deviceSessionId,
    expiresAt,
  }) {
    const result = await db.query(`
      UPDATE ac_device_session
      SET
        last_seen_at = NOW(),
        expires_at = $2
      WHERE device_session_id = $1
        AND revoked_at IS NULL
      RETURNING expires_at
    `, [
      deviceSessionId,
      expiresAt,
    ]);

    return result.rows?.[0] || null;
  }

  async function revokeDeviceSession(
    tokenHash
  ) {
    const result = await db.query(`
      UPDATE ac_device_session
      SET revoked_at =
        COALESCE(revoked_at, NOW())
      WHERE device_token_hash = $1
      RETURNING device_session_id
    `, [tokenHash]);

    return Boolean(result.rowCount);
  }

  async function searchWorkspaceMembers({
    workspaceId,
    requesterMemberId,
    searchText = '',
    limit = 50,
  }) {
    const access = await db.query(`
      SELECT 1
      FROM ac_workspace_member
      WHERE workspace_id = $1
        AND workspace_member_id = $2
        AND status = 'ACTIVE'
      LIMIT 1
    `, [workspaceId, requesterMemberId]);

    if (!access.rowCount) return null;

    const result = await db.query(`
      SELECT
        wm.workspace_member_id,
        i.identity_id,
        COALESCE(wm.display_name_override, i.display_name) AS display_name,
        i.primary_email,
        wm.member_role
      FROM ac_workspace_member wm
      JOIN ac_identity i
        ON i.identity_id = wm.identity_id
      WHERE wm.workspace_id = $1
        AND wm.status = 'ACTIVE'
        AND i.status = 'ACTIVE'
        AND (
          $2 = ''
          OR COALESCE(wm.display_name_override, i.display_name) ILIKE '%' || $2 || '%'
          OR COALESCE(i.primary_email, '') ILIKE '%' || $2 || '%'
        )
      ORDER BY COALESCE(wm.display_name_override, i.display_name), wm.workspace_member_id
      LIMIT $3
    `, [workspaceId, searchText, limit]);

    return result.rows;
  }

  return Object.freeze({
    findLocalLogin,
    recordFailedLogin,
    resetFailedLogin,
    changePassword,
    createSession,
    findActiveSession,
    touchSession,
    revokeSession,
    createDeviceSession,
    findActiveDeviceSession,
    touchDeviceSession,
    revokeDeviceSession,
    searchWorkspaceMembers,
  });
}

module.exports = {
  createLocalIdentityRepository,
};
