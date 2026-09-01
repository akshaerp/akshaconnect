'use strict';

const { boundaryError } = require('../core/boundaryError');

function clean(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function requireTrustedWorkspaceClaims(claims = {}) {
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

  return Object.freeze({
    workspaceId,
    workspaceMemberId,
    identityId,
  });
}

function normalizeChannelCode(value) {
  const source = clean(value).normalize('NFKC').toLowerCase();
  const normalized = source
    .replace(/[^\p{L}\p{N}\p{M}_-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '');

  return normalized;
}

function validateChannelInput(input = {}) {
  const channelName = clean(input.channel_name ?? input.channelName);
  const requestedCode = clean(input.channel_code ?? input.channelCode);
  const channelCode = normalizeChannelCode(requestedCode || channelName);
  const visibility = clean(input.visibility || 'PUBLIC').toUpperCase();

  if (!channelName || channelName.length > 160) {
    throw boundaryError(
      'CHANNEL_NAME_INVALID',
      'Channel name must contain 1 to 160 characters',
      400
    );
  }

  if (!channelCode || channelCode.length > 80) {
    throw boundaryError(
      'CHANNEL_CODE_INVALID',
      'Channel code must contain 1 to 80 characters',
      400
    );
  }

  if (!['PUBLIC', 'PRIVATE'].includes(visibility)) {
    throw boundaryError(
      'CHANNEL_VISIBILITY_INVALID',
      'Channel visibility must be PUBLIC or PRIVATE',
      400
    );
  }

  return Object.freeze({ channelName, channelCode, visibility });
}

function createCollaborationService(repository) {
  if (!repository) throw new TypeError('Collaboration repository is required');

  async function requireActiveRequester(actor) {
    const member = await repository.getActiveWorkspaceMember({
      workspaceId: actor.workspaceId,
      workspaceMemberId: actor.workspaceMemberId,
    });

    if (!member) {
      throw boundaryError('WORKSPACE_ACCESS_DENIED', 'Workspace access denied', 403);
    }

    return member;
  }

  async function listChannels(claims) {
    const actor = requireTrustedWorkspaceClaims(claims);
    await requireActiveRequester(actor);

    return repository.listChannels({
      workspaceId: actor.workspaceId,
      requesterMemberId: actor.workspaceMemberId,
    });
  }

  async function createChannel(claims, input = {}) {
    const actor = requireTrustedWorkspaceClaims(claims);
    const member = await requireActiveRequester(actor);

    if (member.member_role === 'GUEST') {
      throw boundaryError(
        'CHANNEL_CREATE_FORBIDDEN',
        'This workspace member cannot create channels',
        403
      );
    }

    const channel = validateChannelInput(input);

    try {
      return await repository.createChannel({
        workspaceId: actor.workspaceId,
        requesterMemberId: actor.workspaceMemberId,
        channelCode: channel.channelCode,
        channelName: channel.channelName,
        visibility: channel.visibility,
      });
    } catch (error) {
      if (error && error.code === '23505') {
        throw boundaryError(
          'CHANNEL_CODE_EXISTS',
          'A channel with this code already exists in the workspace',
          409
        );
      }
      throw error;
    }
  }

  async function listDirectMessages(claims) {
    const actor = requireTrustedWorkspaceClaims(claims);
    await requireActiveRequester(actor);

    return repository.listDirectMessages({
      workspaceId: actor.workspaceId,
      requesterMemberId: actor.workspaceMemberId,
    });
  }

  async function startDirectMessage(claims, input = {}) {
    const actor = requireTrustedWorkspaceClaims(claims);
    await requireActiveRequester(actor);

    const targetMemberId = clean(
      input.target_workspace_member_id ?? input.targetWorkspaceMemberId
    );

    if (!targetMemberId || targetMemberId === actor.workspaceMemberId) {
      throw boundaryError(
        'DIRECT_MESSAGE_TARGET_INVALID',
        'Direct message target is invalid',
        400
      );
    }

    const target = await repository.getActiveWorkspaceMember({
      workspaceId: actor.workspaceId,
      workspaceMemberId: targetMemberId,
    });

    if (!target || target.identity_status !== 'ACTIVE') {
      throw boundaryError(
        'DIRECT_MESSAGE_TARGET_INVALID',
        'Direct message target is invalid',
        404
      );
    }

    return repository.startDirectMessage({
      workspaceId: actor.workspaceId,
      requesterMemberId: actor.workspaceMemberId,
      targetMemberId,
    });
  }

  return Object.freeze({
    listChannels,
    createChannel,
    listDirectMessages,
    startDirectMessage,
  });
}

module.exports = {
  normalizeChannelCode,
  validateChannelInput,
  requireTrustedWorkspaceClaims,
  createCollaborationService,
};
