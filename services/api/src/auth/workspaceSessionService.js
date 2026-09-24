'use strict';

const crypto = require('node:crypto');
const { boundaryError } = require('../core/boundaryError');
const { sha256 } = require('./localIdentityService');

function clean(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function freezeWorkspace(row, activeWorkspaceId) {
  return Object.freeze({
    workspace_id: row.workspace_id,
    workspace_code: row.workspace_code,
    workspace_name: row.workspace_name,
    workspace_member_id: row.workspace_member_id,
    member_role: row.member_role,
    default_flag: row.default_flag || 'N',
    active_flag: row.workspace_id === activeWorkspaceId ? 'Y' : 'N',
  });
}

function createWorkspaceSessionService({ identityService, repository } = {}) {
  if (!identityService || typeof identityService.verifyAccessToken !== 'function') {
    throw new TypeError('An identity service is required');
  }
  if (
    !repository ||
    typeof repository.listAvailableWorkspaces !== 'function' ||
    typeof repository.replaceSession !== 'function'
  ) {
    throw new TypeError('A workspace session repository is required');
  }

  async function resolveContext(accessToken) {
    const token = clean(accessToken);
    if (!token) {
      throw boundaryError('ACCESS_TOKEN_REQUIRED', 'Access token is required', 401);
    }

    const claims = await identityService.verifyAccessToken(token);
    const rows = await repository.listAvailableWorkspaces({
      identityId: claims.identity_id,
      currentWorkspaceId: claims.workspace_id,
    });

    if (!rows.length) {
      throw boundaryError(
        'WORKSPACE_MEMBERSHIP_NOT_FOUND',
        'No active workspace membership is available for this session.',
        403
      );
    }

    return { token, claims, rows };
  }

  async function listWorkspaces(accessToken) {
    const { claims, rows } = await resolveContext(accessToken);

    return Object.freeze({
      active_workspace_id: claims.workspace_id,
      workspaces: Object.freeze(
        rows.map((row) => freezeWorkspace(row, claims.workspace_id))
      ),
    });
  }

  async function switchWorkspace(accessToken, input = {}, requestMetadata = {}) {
    const targetWorkspaceId = clean(input.workspace_id ?? input.workspaceId);
    if (!targetWorkspaceId) {
      throw boundaryError(
        'WORKSPACE_SWITCH_TARGET_REQUIRED',
        'A target workspace is required.',
        400
      );
    }

    const { token, claims, rows } = await resolveContext(accessToken);
    const target = rows.find((row) => row.workspace_id === targetWorkspaceId);

    if (!target) {
      throw boundaryError(
        'WORKSPACE_SWITCH_ACCESS_DENIED',
        'The requested workspace is not available to this session.',
        403
      );
    }

    const workspaceListFor = (activeWorkspaceId) => Object.freeze(
      rows.map((row) => freezeWorkspace(row, activeWorkspaceId))
    );

    if (target.workspace_id === claims.workspace_id) {
      return Object.freeze({
        switched: false,
        access_token: token,
        token_type: 'Bearer',
        session_id: claims.session_id,
        identity: Object.freeze({
          identity_id: claims.identity_id,
          display_name: claims.display_name,
          primary_email: claims.primary_email || null,
          identity_provider: claims.identity_provider,
        }),
        workspace: Object.freeze({
          workspace_id: target.workspace_id,
          workspace_code: target.workspace_code,
          workspace_name: target.workspace_name,
        }),
        membership: Object.freeze({
          workspace_member_id: target.workspace_member_id,
          member_role: target.member_role,
        }),
        workspaces: workspaceListFor(target.workspace_id),
      });
    }

    const nextAccessToken = crypto.randomBytes(32).toString('base64url');
    const replacement = await repository.replaceSession({
      sessionId: claims.session_id,
      identityId: claims.identity_id,
      currentWorkspaceId: claims.workspace_id,
      targetWorkspaceId: target.workspace_id,
      tokenHash: sha256(nextAccessToken),
      userAgentHash: requestMetadata.userAgent ? sha256(requestMetadata.userAgent) : null,
      clientIpHash: requestMetadata.clientIp ? sha256(requestMetadata.clientIp) : null,
    });

    if (!replacement) {
      throw boundaryError(
        'WORKSPACE_SWITCH_SESSION_INVALID',
        'The current session is no longer available for workspace switching.',
        401
      );
    }

    return Object.freeze({
      switched: true,
      access_token: nextAccessToken,
      token_type: 'Bearer',
      expires_at: new Date(replacement.session.expires_at).toISOString(),
      session_id: replacement.session.session_id,
      identity: Object.freeze({
        identity_id: claims.identity_id,
        display_name: claims.display_name,
        primary_email: claims.primary_email || null,
        identity_provider: replacement.identity_provider,
      }),
      workspace: Object.freeze({
        workspace_id: replacement.workspace.workspace_id,
        workspace_code: replacement.workspace.workspace_code,
        workspace_name: replacement.workspace.workspace_name,
      }),
      membership: replacement.membership,
      workspaces: workspaceListFor(replacement.workspace.workspace_id),
    });
  }

  return Object.freeze({
    listWorkspaces,
    switchWorkspace,
  });
}

module.exports = { createWorkspaceSessionService };
