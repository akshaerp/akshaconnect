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
    createSession,
    findActiveSession,
    touchSession,
    revokeSession,
    searchWorkspaceMembers,
  });
}

module.exports = {
  createLocalIdentityRepository,
};
