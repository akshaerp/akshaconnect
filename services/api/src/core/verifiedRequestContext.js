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

function createVerifiedRequestContextFromClaims(claims) {
  if (!claims || typeof claims !== 'object' || Array.isArray(claims)) {
    throw boundaryError('IDENTITY_CLAIMS_INVALID', 'Verified identity claims are required', 401);
  }

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

  const context = Object.freeze({
    user_id: userId,
    tenant_id: tenantId,
    active_organization_id: organizationId,
    active_branch_id: branchId,
    session_id: sessionId,
  });

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
