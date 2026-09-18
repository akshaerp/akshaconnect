'use strict';

function createPushRegistrationRepository(db) {
  if (
    !db ||
    typeof db.query !== 'function'
  ) {
    throw new TypeError(
      'A PostgreSQL pool is required'
    );
  }

  async function upsertRegistration({
    deviceSessionId,
    provider,
    platform,
    pushToken,
  }) {
    const result = await db.query(`
      WITH revoked_previous AS (
        UPDATE ac_push_registration
        SET revoked_at = COALESCE(revoked_at, NOW())
        WHERE device_session_id = $1
          AND provider = $2
          AND push_token <> $4
          AND revoked_at IS NULL
      )
      INSERT INTO ac_push_registration (
        device_session_id,
        provider,
        platform,
        push_token,
        last_seen_at
      )
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (provider, push_token)
      DO UPDATE SET
        device_session_id = EXCLUDED.device_session_id,
        platform = EXCLUDED.platform,
        last_seen_at = NOW(),
        revoked_at = NULL
      RETURNING
        push_registration_id,
        device_session_id,
        provider,
        platform,
        created_at,
        last_seen_at,
        revoked_at
    `, [
      deviceSessionId,
      provider,
      platform,
      pushToken,
    ]);

    return result.rows?.[0] || null;
  }

  async function revokeRegistration({
    deviceSessionId,
    provider,
    pushToken = null,
  }) {
    const result = await db.query(`
      UPDATE ac_push_registration
      SET revoked_at = COALESCE(revoked_at, NOW())
      WHERE device_session_id = $1
        AND provider = $2
        AND revoked_at IS NULL
        AND (
          $3::text IS NULL
          OR push_token = $3
        )
      RETURNING push_registration_id
    `, [
      deviceSessionId,
      provider,
      pushToken || null,
    ]);

    return Number(result.rowCount || 0);
  }

  async function listActiveRegistrations({
    workspaceId,
    workspaceMemberIds = [],
  }) {
    const memberIds =
      [...new Set(
        (workspaceMemberIds || [])
          .filter(Boolean)
      )];

    if (memberIds.length === 0) {
      return [];
    }

    const result = await db.query(`
      SELECT
        pr.push_registration_id,
        pr.device_session_id,
        pr.provider,
        pr.platform,
        pr.push_token,
        d.workspace_member_id
      FROM ac_push_registration pr
      JOIN ac_device_session d
        ON d.device_session_id = pr.device_session_id
      JOIN ac_workspace_member wm
        ON wm.workspace_id = d.workspace_id
       AND wm.workspace_member_id = d.workspace_member_id
       AND wm.identity_id = d.identity_id
       AND wm.status = 'ACTIVE'
      JOIN ac_identity i
        ON i.identity_id = d.identity_id
       AND i.status = 'ACTIVE'
      JOIN ac_local_credential c
        ON c.identity_id = d.identity_id
       AND c.credential_status = 'ACTIVE'
      WHERE d.workspace_id = $1
        AND d.workspace_member_id = ANY($2::uuid[])
        AND d.revoked_at IS NULL
        AND d.expires_at > NOW()
        AND pr.revoked_at IS NULL
        AND pr.provider = 'FCM'
        AND (
          c.password_changed_at IS NULL
          OR d.created_at > c.password_changed_at
        )
      ORDER BY pr.last_seen_at DESC
    `, [
      workspaceId,
      memberIds,
    ]);

    return result.rows || [];
  }

  async function revokeTokens({
    provider,
    tokens = [],
  }) {
    const values =
      [...new Set(
        (tokens || [])
          .filter(Boolean)
      )];

    if (values.length === 0) {
      return 0;
    }

    const result = await db.query(`
      UPDATE ac_push_registration
      SET revoked_at = COALESCE(revoked_at, NOW())
      WHERE provider = $1
        AND push_token = ANY($2::text[])
        AND revoked_at IS NULL
      RETURNING push_registration_id
    `, [
      provider,
      values,
    ]);

    return Number(result.rowCount || 0);
  }

  return Object.freeze({
    upsertRegistration,
    revokeRegistration,
    listActiveRegistrations,
    revokeTokens,
  });
}

module.exports = {
  createPushRegistrationRepository,
};