'use strict';

const { boundaryError } = require('./boundaryError');

const trustedContexts = new WeakSet();

function positiveInt(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function clean(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function createLocalContext(claims) {
  const identityId = clean(claims.identity_id ?? claims.identityId);
  const workspaceId = clean(claims.workspace_id ?? claims.workspaceId);
  const memberId = clean(claims.workspace_member_id ?? claims.workspaceMemberId);
  const sessionId = clean(claims.session_id ?? claims.sessionId ?? claims.sid);
  const provider = clean(claims.identity_provider ?? claims.identityProvider) || 'LOCAL';

  if (!identityId) throw boundaryError('IDENTITY_USER_REQUIRED', 'Verified identity is required', 401);
  if (!workspaceId) throw boundaryError('IDENTITY_WORKSPACE_REQUIRED', 'Verified workspace is required', 401);
  if (!memberId) throw boundaryError('IDENTITY_MEMBER_REQUIRED', 'Verified workspace membership is required', 401);
  if (!sessionId) throw boundaryError('IDENTITY_SESSION_REQUIRED', 'Verified session identity is required', 401);

  return Object.freeze({
    identity_id: identityId,
    workspace_id: workspaceId,
    workspace_member_id: memberId,
    session_id: sessionId,
    identity_provider: provider,
  });
}

function createLegacyProviderContext(claims) {
  const userId = positiveInt(claims.user_id ?? claims.userId ?? claims.id);
  const tenantId = clean(claims.tenant_id ?? claims.tenantId ?? claims.tenant_code ?? claims.tenantCode);
  const organizationId = positiveInt(
    claims.active_organization_id ??
    claims.current_organization_id ??
    claims.currentOrganizationId ??
    claims.organization_id ??
    claims.organizationId ??
    claims.default_organization_id ??
    claims.defaultOrganizationId
  );
  const branchId = positiveInt(
    claims.active_branch_id ??
    claims.current_branch_id ??
    claims.currentBranchId ??
    claims.branch_id ??
    claims.branchId ??
    claims.default_branch_id ??
    claims.defaultBranchId
  );
  const sessionId = clean(claims.session_id ?? claims.sessionId ?? claims.sid);

  if (!userId) throw boundaryError('IDENTITY_USER_REQUIRED', 'Verified user identity is required', 401);
  if (!tenantId) throw boundaryError('IDENTITY_TENANT_REQUIRED', 'Verified tenant identity is required', 401);
  if (!organizationId) {
    throw boundaryError('IDENTITY_ORGANIZATION_REQUIRED', 'Verified active organization is required', 401);
  }
  if (!sessionId) throw boundaryError('IDENTITY_SESSION_REQUIRED', 'Verified session identity is required', 401);

  // Preserve the exact P0 verified-context contract for existing external
  // providers. Provider-neutral LOCAL claims use the separate workspace context.
  return Object.freeze({
    user_id: userId,
    tenant_id: tenantId,
    active_organization_id: organizationId,
    active_branch_id: branchId,
    session_id: sessionId,
  });
}

function createVerifiedRequestContextFromClaims(claims) {
  if (!claims || typeof claims !== 'object' || Array.isArray(claims)) {
    throw boundaryError('IDENTITY_CLAIMS_INVALID', 'Verified identity claims are required', 401);
  }

  const hasWorkspaceClaims =
    clean(claims.workspace_id ?? claims.workspaceId) ||
    clean(claims.workspace_member_id ?? claims.workspaceMemberId) ||
    clean(claims.identity_id ?? claims.identityId);

  const context = hasWorkspaceClaims
    ? createLocalContext(claims)
    : createLegacyProviderContext(claims);

  trustedContexts.add(context);
  return context;
}

function assertVerifiedRequestContext(context) {
  if (!context || typeof context !== 'object' || !trustedContexts.has(context)) {
    throw boundaryError(
      'VERIFIED_CONTEXT_REQUIRED',
      'A verified AkshaConnect request context is required',
      401
    );
  }
  return context;
}

module.exports = {
  createVerifiedRequestContextFromClaims,
  assertVerifiedRequestContext,
};
