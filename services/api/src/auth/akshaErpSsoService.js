'use strict';

const crypto = require('node:crypto');
const { boundaryError } = require('../core/boundaryError');
const { sha256 } = require('./localIdentityService');

const DEFAULT_SSO_SESSION_TTL_SECONDS = 8 * 60 * 60;
const MAX_SSO_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

function clean(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function positiveInt(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function safeTtl(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return DEFAULT_SSO_SESSION_TTL_SECONDS;
  return Math.min(parsed, MAX_SSO_SESSION_TTL_SECONDS);
}

function createAkshaErpSsoService({ identityGateway, repository, sessionRepository, sessionTtlSeconds } = {}) {
  if (!identityGateway || typeof identityGateway.verifyAccessToken !== 'function') {
    throw new TypeError('AkshaERP identity gateway is required');
  }
  if (!repository || typeof repository.provisionIdentity !== 'function') {
    throw new TypeError('AkshaERP SSO repository is required');
  }
  if (!sessionRepository || typeof sessionRepository.createSession !== 'function') {
    throw new TypeError('AkshaConnect session repository is required');
  }

  const ttlSeconds = safeTtl(sessionTtlSeconds);

  async function loginFromErpToken(erpAccessToken, requestMetadata = {}) {
    const token = clean(erpAccessToken);
    if (!token) {
      throw boundaryError('AKSHAERP_SSO_TOKEN_REQUIRED', 'AkshaERP access token is required.', 401);
    }

    const claims = await identityGateway.verifyAccessToken(token);
    const tenantId = clean(claims?.tenant_id);
    const userId = positiveInt(claims?.user_id);
    const organizationId = positiveInt(claims?.active_organization_id);
    const branchId = positiveInt(claims?.active_branch_id);
    const displayName = clean(claims?.display_name);
    const primaryEmail = clean(claims?.akshamail) || clean(claims?.email);

    if (!tenantId || !userId || !organizationId || !displayName) {
      throw boundaryError(
        'AKSHAERP_SSO_IDENTITY_INCOMPLETE',
        'AkshaERP returned an incomplete verified identity.',
        502
      );
    }

    const provisioned = await repository.provisionIdentity({
      tenantId,
      organizationId,
      branchId,
      userId,
      displayName,
      primaryEmail,
      username: claims?.username,
      email: claims?.email,
      akshamail: claims?.akshamail,
    });

    const accessToken = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    const session = await sessionRepository.createSession({
      workspaceId: provisioned.workspace_id,
      workspaceMemberId: provisioned.workspace_member_id,
      identityId: provisioned.identity_id,
      identityProvider: 'AKSHAERP',
      tokenHash: sha256(accessToken),
      expiresAt,
      userAgentHash: requestMetadata.userAgent ? sha256(requestMetadata.userAgent) : null,
      clientIpHash: requestMetadata.clientIp ? sha256(requestMetadata.clientIp) : null,
    });

    return Object.freeze({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_at: new Date(session.expires_at).toISOString(),
      session_id: session.session_id,
      identity: Object.freeze({
        identity_id: provisioned.identity_id,
        display_name: provisioned.display_name,
        primary_email: provisioned.primary_email || null,
        identity_provider: 'AKSHAERP',
        external_subject: provisioned.external_subject,
      }),
      tenant: Object.freeze({
        tenant_id: provisioned.tenant_id,
        tenant_code: provisioned.tenant_code,
        tenant_name: provisioned.tenant_name,
      }),
      workspace: Object.freeze({
        workspace_id: provisioned.workspace_id,
        workspace_code: provisioned.workspace_code,
        workspace_name: provisioned.workspace_name,
      }),
      membership: Object.freeze({
        workspace_member_id: provisioned.workspace_member_id,
        member_role: provisioned.member_role,
      }),
      workspaces: provisioned.workspaces,
      provisioning: Object.freeze({
        created_identity: provisioned.created_identity,
        created_membership: provisioned.created_membership,
      }),
    });
  }

  return Object.freeze({ loginFromErpToken });
}

module.exports = {
  DEFAULT_SSO_SESSION_TTL_SECONDS,
  MAX_SSO_SESSION_TTL_SECONDS,
  createAkshaErpSsoService,
};
