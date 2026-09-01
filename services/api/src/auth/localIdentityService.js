'use strict';

const crypto = require('node:crypto');
const { boundaryError } = require('../core/boundaryError');

const DEFAULT_SESSION_TTL_SECONDS = 8 * 60 * 60;
const MAX_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

function clean(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function safeTtl(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return DEFAULT_SESSION_TTL_SECONDS;
  return Math.min(parsed, MAX_SESSION_TTL_SECONDS);
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function invalidLogin() {
  return boundaryError(
    'LOCAL_AUTH_INVALID',
    'Invalid workspace, login, or password',
    401
  );
}

function assertActiveLogin(row) {
  if (!row) throw invalidLogin();

  const now = Date.now();
  const lockedUntil = row.locked_until ? Date.parse(row.locked_until) : 0;

  if (
    row.identity_status !== 'ACTIVE' ||
    row.workspace_status !== 'ACTIVE' ||
    row.member_status !== 'ACTIVE' ||
    row.credential_status !== 'ACTIVE' ||
    (Number.isFinite(lockedUntil) && lockedUntil > now)
  ) {
    throw invalidLogin();
  }
}

function createLocalIdentityService(repository, options = {}) {
  if (!repository) throw new TypeError('Local identity repository is required');

  const ttlSeconds = safeTtl(options.sessionTtlSeconds);

  async function login(input = {}, requestMetadata = {}) {
    const workspaceCode = clean(input.workspace_code ?? input.workspaceCode);
    const loginName = clean(input.login_name ?? input.loginName);
    const password = String(input.password ?? '');

    if (!workspaceCode || !loginName || !password) {
      throw invalidLogin();
    }

    const row = await repository.findLocalLogin({
      workspaceCode,
      loginName,
      password,
    });

    if (!row) throw invalidLogin();

    try {
      assertActiveLogin(row);
    } catch (error) {
      if (row.identity_id && !row.password_matches) {
        await repository.recordFailedLogin(row.identity_id);
      }
      throw error;
    }

    if (!row.password_matches) {
      await repository.recordFailedLogin(row.identity_id);
      throw invalidLogin();
    }

    await repository.resetFailedLogin(row.identity_id);

    const accessToken = crypto.randomBytes(32).toString('base64url');
    const tokenHash = sha256(accessToken);
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    const session = await repository.createSession({
      workspaceId: row.workspace_id,
      workspaceMemberId: row.workspace_member_id,
      identityId: row.identity_id,
      tokenHash,
      expiresAt,
      userAgentHash: requestMetadata.userAgent
        ? sha256(requestMetadata.userAgent)
        : null,
      clientIpHash: requestMetadata.clientIp
        ? sha256(requestMetadata.clientIp)
        : null,
    });

    return Object.freeze({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_at: new Date(session.expires_at).toISOString(),
      session_id: session.session_id,
      identity: Object.freeze({
        identity_id: row.identity_id,
        display_name: row.display_name,
        primary_email: row.primary_email || null,
      }),
      workspace: Object.freeze({
        workspace_id: row.workspace_id,
        workspace_code: row.workspace_code,
        workspace_name: row.workspace_name,
      }),
      membership: Object.freeze({
        workspace_member_id: row.workspace_member_id,
        member_role: row.member_role,
      }),
    });
  }

  async function verifyAccessToken(accessToken) {
    const token = clean(accessToken);
    if (!token) {
      throw boundaryError('ACCESS_TOKEN_REQUIRED', 'Access token is required', 401);
    }

    const row = await repository.findActiveSession(sha256(token));
    if (
      !row ||
      row.identity_status !== 'ACTIVE' ||
      row.workspace_status !== 'ACTIVE' ||
      row.member_status !== 'ACTIVE'
    ) {
      throw boundaryError('LOCAL_SESSION_INVALID', 'Session is invalid or expired', 401);
    }

    await repository.touchSession(row.session_id);

    return Object.freeze({
      identity_id: row.identity_id,
      workspace_id: row.workspace_id,
      workspace_member_id: row.workspace_member_id,
      session_id: row.session_id,
      identity_provider: 'LOCAL',
      display_name: row.display_name,
      primary_email: row.primary_email || null,
      workspace_code: row.workspace_code,
      workspace_name: row.workspace_name,
      member_role: row.member_role,
    });
  }

  async function logout(accessToken) {
    const token = clean(accessToken);
    if (!token) {
      throw boundaryError('ACCESS_TOKEN_REQUIRED', 'Access token is required', 401);
    }

    await repository.revokeSession(sha256(token));
    return Object.freeze({ success: true });
  }

  async function searchUsers(input = {}) {
    const workspaceId = clean(input.workspace_id);
    const requesterMemberId = clean(input.requester_member_id);
    const searchText = clean(input.search_text);
    const requestedLimit = Number(input.limit);
    const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, 100)
      : 50;

    if (!workspaceId || !requesterMemberId) {
      throw boundaryError('VERIFIED_CONTEXT_REQUIRED', 'Trusted workspace context is required', 401);
    }

    const rows = await repository.searchWorkspaceMembers({
      workspaceId,
      requesterMemberId,
      searchText,
      limit,
    });

    if (!rows) {
      throw boundaryError('WORKSPACE_ACCESS_DENIED', 'Workspace access denied', 403);
    }

    return rows;
  }

  return Object.freeze({
    login,
    verifyAccessToken,
    logout,
    searchUsers,
  });
}

module.exports = {
  DEFAULT_SESSION_TTL_SECONDS,
  MAX_SESSION_TTL_SECONDS,
  sha256,
  createLocalIdentityService,
};
