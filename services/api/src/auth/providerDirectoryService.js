'use strict';

const { boundaryError } = require('../core/boundaryError');

function clean(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function positiveInt(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function safeLimit(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return 50;
  return Math.min(parsed, 100);
}

function normalizeRemoteUsers(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.users)) return payload.users;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

function mergeMembers(left = [], right = [], limit = 50) {
  const merged = new Map();

  for (const row of [...left, ...right]) {
    const key = clean(row?.workspace_member_id);
    if (!key || merged.has(key)) continue;
    merged.set(key, row);
  }

  return [...merged.values()].slice(0, limit);
}

function createProviderDirectoryService({
  identityProvider = 'LOCAL',
  localIdentityService,
  identityGateway = null,
  erpDirectoryRepository = null,
} = {}) {
  if (
    !localIdentityService ||
    typeof localIdentityService.searchUsers !== 'function'
  ) {
    throw new TypeError('A local identity service is required');
  }

  const provider = String(identityProvider || 'LOCAL').trim().toUpperCase();

  async function searchUsers(claims = {}, input = {}) {
    const workspaceId = clean(claims.workspace_id);
    const workspaceMemberId = clean(claims.workspace_member_id);
    const identityId = clean(claims.identity_id);
    const sessionProvider = String(
      claims.identity_provider || 'LOCAL'
    ).trim().toUpperCase();
    const searchText = clean(
      input.search_text ??
      input.searchText ??
      input.query
    );
    const limit = safeLimit(input.limit);

    if (!workspaceId || !workspaceMemberId || !identityId) {
      throw boundaryError(
        'VERIFIED_CONTEXT_REQUIRED',
        'Trusted workspace context is required',
        401
      );
    }

    const localMembers = await localIdentityService.searchUsers({
      workspace_id: workspaceId,
      requester_member_id: workspaceMemberId,
      search_text: searchText,
      limit,
    });

    // Empty picker state deliberately lists only already-provisioned
    // AkshaConnect members. This avoids JIT-provisioning a large ERP directory
    // merely because the picker was opened.
    if (
      !searchText ||
      provider !== 'AKSHAERP' ||
      sessionProvider !== 'AKSHAERP'
    ) {
      return localMembers || [];
    }

    if (
      !identityGateway ||
      typeof identityGateway.searchUsers !== 'function' ||
      !erpDirectoryRepository ||
      typeof erpDirectoryRepository.getTrustedDirectoryContext !== 'function' ||
      typeof erpDirectoryRepository.provisionDirectoryUser !== 'function'
    ) {
      throw boundaryError(
        'AKSHAERP_DIRECTORY_NOT_CONFIGURED',
        'AkshaERP directory search is not configured.',
        503
      );
    }

    const context = await erpDirectoryRepository.getTrustedDirectoryContext({
      identityId,
      workspaceId,
      workspaceMemberId,
    });

    const organizationId = positiveInt(context?.organization_id);
    const requesterUserId = positiveInt(context?.requester_user_id);
    const erpTenantId = clean(context?.erp_tenant_id);
    const connectTenantId = clean(context?.connect_tenant_id);

    if (
      !organizationId ||
      !requesterUserId ||
      !erpTenantId ||
      !connectTenantId
    ) {
      throw boundaryError(
        'AKSHAERP_DIRECTORY_CONTEXT_INVALID',
        'The current AkshaERP-linked identity is missing trusted directory context.',
        403
      );
    }

    const remotePayload = await identityGateway.searchUsers({
      tenant_id: erpTenantId,
      organization_id: organizationId,
      requester_user_id: requesterUserId,
      search_text: searchText,
      limit,
    });

    const remoteUsers = normalizeRemoteUsers(remotePayload);
    const provisioned = [];

    for (const user of remoteUsers) {
      if (user?.is_active === false) continue;

      const remoteUserId = positiveInt(user?.user_id ?? user?.userId);
      if (!remoteUserId) continue;

      const member = await erpDirectoryRepository.provisionDirectoryUser({
        connectTenantId,
        workspaceId,
        erpTenantId,
        organizationId,
        user,
      });

      if (member?.available && member.workspace_member_id) {
        provisioned.push(member);
      }
    }

    return mergeMembers(localMembers || [], provisioned, limit);
  }

  return Object.freeze({ searchUsers });
}

module.exports = {
  safeLimit,
  normalizeRemoteUsers,
  mergeMembers,
  createProviderDirectoryService,
};
