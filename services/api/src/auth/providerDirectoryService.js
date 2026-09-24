'use strict';

const { boundaryError } = require('../core/boundaryError');

const AKSHAERP_DIRECTORY_MEMBER_PREFIX = 'dir:AKSHAERP:';

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

function directoryMemberId(externalUserId) {
  const userId = positiveInt(externalUserId);
  return userId
    ? `${AKSHAERP_DIRECTORY_MEMBER_PREFIX}${userId}`
    : '';
}

function directoryExternalUserId(value) {
  const text = clean(value);
  if (!text.startsWith(AKSHAERP_DIRECTORY_MEMBER_PREFIX)) return null;
  return positiveInt(text.slice(AKSHAERP_DIRECTORY_MEMBER_PREFIX.length));
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

  function requireErpDirectory() {
    if (
      !identityGateway ||
      typeof identityGateway.searchUsers !== 'function' ||
      !erpDirectoryRepository ||
      typeof erpDirectoryRepository.getTrustedDirectoryContext !== 'function' ||
      typeof erpDirectoryRepository.decorateDirectoryUsers !== 'function' ||
      typeof erpDirectoryRepository.provisionDirectoryUser !== 'function'
    ) {
      throw boundaryError(
        'AKSHAERP_DIRECTORY_NOT_CONFIGURED',
        'AkshaERP directory search is not configured.',
        503
      );
    }
  }

  async function trustedErpContext(claims = {}) {
    const workspaceId = clean(claims.workspace_id);
    const workspaceMemberId = clean(claims.workspace_member_id);
    const identityId = clean(claims.identity_id);

    if (!workspaceId || !workspaceMemberId || !identityId) {
      throw boundaryError(
        'VERIFIED_CONTEXT_REQUIRED',
        'Trusted workspace context is required',
        401
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

    return Object.freeze({
      workspaceId,
      workspaceMemberId,
      identityId,
      organizationId,
      requesterUserId,
      erpTenantId,
      connectTenantId,
    });
  }

  function isDirectoryMemberId(value) {
    return Boolean(directoryExternalUserId(value));
  }

  async function searchUsers(claims = {}, input = {}) {
    const sessionProvider = String(
      claims.identity_provider || 'LOCAL'
    ).trim().toUpperCase();

    const searchText = clean(
      input.search_text ??
      input.searchText ??
      input.query
    );
    const limit = safeLimit(input.limit);

    if (
      provider !== 'AKSHAERP' ||
      sessionProvider !== 'AKSHAERP'
    ) {
      return localIdentityService.searchUsers({
        workspace_id: clean(claims.workspace_id),
        requester_member_id: clean(claims.workspace_member_id),
        search_text: searchText,
        limit,
      });
    }

    requireErpDirectory();
    const context = await trustedErpContext(claims);

    const remotePayload = await identityGateway.searchUsers({
      tenant_id: context.erpTenantId,
      organization_id: context.organizationId,
      requester_user_id: context.requesterUserId,
      search_text: searchText,
      limit,
    });

    const remoteUsers = normalizeRemoteUsers(remotePayload)
      .filter((user) => user?.is_active !== false)
      .filter((user) => positiveInt(user?.user_id ?? user?.userId));

    return erpDirectoryRepository.decorateDirectoryUsers({
      workspaceId: context.workspaceId,
      erpTenantId: context.erpTenantId,
      users: remoteUsers,
    });
  }

  async function resolveTargetMember(claims = {}, input = {}) {
    const sessionProvider = String(
      claims.identity_provider || 'LOCAL'
    ).trim().toUpperCase();

    if (
      provider !== 'AKSHAERP' ||
      sessionProvider !== 'AKSHAERP'
    ) {
      throw boundaryError(
        'DIRECTORY_TARGET_PROVIDER_INVALID',
        'This directory target cannot be resolved for the current identity provider.',
        400
      );
    }

    requireErpDirectory();

    const directoryId = clean(
      input.directory_member_id ??
      input.directoryMemberId ??
      input.target_workspace_member_id ??
      input.targetWorkspaceMemberId
    );
    const externalUserId = directoryExternalUserId(directoryId);

    if (!externalUserId) {
      throw boundaryError(
        'DIRECTORY_TARGET_INVALID',
        'Directory target is invalid.',
        400
      );
    }

    const context = await trustedErpContext(claims);

    const remotePayload = await identityGateway.searchUsers({
      tenant_id: context.erpTenantId,
      organization_id: context.organizationId,
      requester_user_id: context.requesterUserId,
      user_id: externalUserId,
      search_text: '',
      limit: 1,
    });

    const exactUser = normalizeRemoteUsers(remotePayload).find((user) => (
      positiveInt(user?.user_id ?? user?.userId) === externalUserId &&
      user?.is_active !== false
    ));

    if (!exactUser) {
      throw boundaryError(
        'DIRECTORY_TARGET_NOT_FOUND',
        'The selected user is no longer available in the current AkshaERP organization.',
        404
      );
    }

    const member = await erpDirectoryRepository.provisionDirectoryUser({
      connectTenantId: context.connectTenantId,
      workspaceId: context.workspaceId,
      erpTenantId: context.erpTenantId,
      organizationId: context.organizationId,
      user: exactUser,
    });

    if (!member?.available || !member.workspace_member_id) {
      throw boundaryError(
        'DIRECTORY_TARGET_NOT_AVAILABLE',
        'The selected user is not available for AkshaConnect messaging.',
        409
      );
    }

    return member;
  }

  return Object.freeze({
    searchUsers,
    resolveTargetMember,
    isDirectoryMemberId,
  });
}

module.exports = {
  AKSHAERP_DIRECTORY_MEMBER_PREFIX,
  safeLimit,
  normalizeRemoteUsers,
  directoryMemberId,
  directoryExternalUserId,
  createProviderDirectoryService,
};
