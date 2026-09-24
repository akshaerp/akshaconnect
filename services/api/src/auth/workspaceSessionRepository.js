'use strict';

const { boundaryError } = require('../core/boundaryError');

function createWorkspaceSessionRepository(pool) {
  if (!pool || typeof pool.query !== 'function' || typeof pool.connect !== 'function') {
    throw new TypeError('A PostgreSQL pool with query/connect is required');
  }

  async function listAvailableWorkspaces({ identityId, currentWorkspaceId }) {
    const result = await pool.query(`
      WITH current_workspace AS (
        SELECT workspace_id, tenant_id
        FROM ac_workspace
        WHERE workspace_id = $2
          AND status = 'ACTIVE'
      )
      SELECT
        wm.workspace_member_id,
        wm.workspace_id,
        wm.member_role,
        wm.status AS membership_status,
        w.workspace_code,
        w.workspace_name,
        w.default_flag,
        w.tenant_id,
        CASE WHEN w.workspace_id = $2 THEN 'Y' ELSE 'N' END AS active_flag
      FROM ac_workspace_member wm
      JOIN ac_workspace w
        ON w.workspace_id = wm.workspace_id
      JOIN current_workspace cw
        ON (
          (cw.tenant_id IS NOT NULL AND w.tenant_id = cw.tenant_id)
          OR
          (cw.tenant_id IS NULL AND w.workspace_id = cw.workspace_id)
        )
      WHERE wm.identity_id = $1
        AND wm.status = 'ACTIVE'
        AND w.status = 'ACTIVE'
      ORDER BY
        CASE WHEN w.workspace_id = $2 THEN 0 ELSE 1 END,
        CASE WHEN w.default_flag = 'Y' THEN 0 ELSE 1 END,
        w.workspace_name,
        w.workspace_id
    `, [identityId, currentWorkspaceId]);

    return result.rows || [];
  }

  async function replaceSession({
    sessionId,
    identityId,
    currentWorkspaceId,
    targetWorkspaceId,
    tokenHash,
    userAgentHash,
    clientIpHash,
  }) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const currentResult = await client.query(`
        SELECT
          s.session_id,
          s.expires_at,
          s.identity_provider,
          w.tenant_id
        FROM ac_session s
        JOIN ac_workspace w
          ON w.workspace_id = s.workspace_id
        WHERE s.session_id = $1
          AND s.identity_id = $2
          AND s.workspace_id = $3
          AND s.revoked_at IS NULL
          AND s.expires_at > NOW()
          AND w.status = 'ACTIVE'
        LIMIT 1
        FOR UPDATE OF s
      `, [sessionId, identityId, currentWorkspaceId]);

      const current = currentResult.rows?.[0];
      if (!current) {
        await client.query('ROLLBACK');
        return null;
      }

      let targetResult;
      if (current.tenant_id) {
        targetResult = await client.query(`
          SELECT
            wm.workspace_member_id,
            wm.workspace_id,
            wm.member_role,
            w.workspace_code,
            w.workspace_name,
            w.default_flag,
            w.tenant_id
          FROM ac_workspace_member wm
          JOIN ac_workspace w
            ON w.workspace_id = wm.workspace_id
          WHERE wm.identity_id = $1
            AND wm.workspace_id = $2
            AND wm.status = 'ACTIVE'
            AND w.status = 'ACTIVE'
            AND w.tenant_id = $3
          LIMIT 1
          FOR SHARE OF wm, w
        `, [identityId, targetWorkspaceId, current.tenant_id]);
      } else {
        // Legacy/unassigned workspaces are deliberately isolated. They cannot
        // be used as a bridge into another unassigned workspace.
        targetResult = await client.query(`
          SELECT
            wm.workspace_member_id,
            wm.workspace_id,
            wm.member_role,
            w.workspace_code,
            w.workspace_name,
            w.default_flag,
            w.tenant_id
          FROM ac_workspace_member wm
          JOIN ac_workspace w
            ON w.workspace_id = wm.workspace_id
          WHERE wm.identity_id = $1
            AND wm.workspace_id = $2
            AND wm.workspace_id = $3
            AND wm.status = 'ACTIVE'
            AND w.status = 'ACTIVE'
            AND w.tenant_id IS NULL
          LIMIT 1
          FOR SHARE OF wm, w
        `, [identityId, targetWorkspaceId, currentWorkspaceId]);
      }

      const target = targetResult.rows?.[0];
      if (!target) {
        throw boundaryError(
          'WORKSPACE_SWITCH_ACCESS_DENIED',
          'The requested workspace is not available to this session.',
          403
        );
      }

      const inserted = await client.query(`
        INSERT INTO ac_session (
          workspace_id,
          workspace_member_id,
          identity_id,
          identity_provider,
          token_hash,
          expires_at,
          user_agent_hash,
          client_ip_hash
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING session_id, created_at, expires_at
      `, [
        target.workspace_id,
        target.workspace_member_id,
        identityId,
        String(current.identity_provider || 'LOCAL').trim().toUpperCase(),
        tokenHash,
        current.expires_at,
        userAgentHash,
        clientIpHash,
      ]);

      const revoked = await client.query(`
        UPDATE ac_session
        SET revoked_at = COALESCE(revoked_at, NOW())
        WHERE session_id = $1
          AND identity_id = $2
          AND revoked_at IS NULL
        RETURNING session_id
      `, [sessionId, identityId]);

      if (revoked.rowCount !== 1) {
        throw boundaryError(
          'WORKSPACE_SWITCH_SESSION_CONFLICT',
          'The current session changed before the workspace switch completed.',
          409
        );
      }

      await client.query('COMMIT');

      return Object.freeze({
        session: inserted.rows[0],
        workspace: Object.freeze({
          workspace_id: target.workspace_id,
          workspace_code: target.workspace_code,
          workspace_name: target.workspace_name,
          default_flag: target.default_flag,
          tenant_id: target.tenant_id || null,
        }),
        membership: Object.freeze({
          workspace_member_id: target.workspace_member_id,
          member_role: target.member_role,
        }),
        identity_provider: String(current.identity_provider || 'LOCAL').trim().toUpperCase(),
      });
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      throw error;
    } finally {
      client.release();
    }
  }

  return Object.freeze({
    listAvailableWorkspaces,
    replaceSession,
  });
}

module.exports = { createWorkspaceSessionRepository };
