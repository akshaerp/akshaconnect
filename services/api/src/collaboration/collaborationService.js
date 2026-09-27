'use strict';

const { boundaryError } = require('../core/boundaryError');

const WORKSPACE_CHANNEL_MANAGERS = new Set(['OWNER', 'ADMIN']);
const CHANNEL_MEMBER_MANAGERS = new Set(['OWNER', 'MODERATOR']);

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

function createCollaborationService(repository, { presenceRegistry = null } = {}) {
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

  async function requireChannelContext(actor, requester) {
    const channel = await repository.getChannelForConversation({
      workspaceId: actor.workspaceId,
      conversationId: actor.conversationId,
      requesterMemberId: actor.workspaceMemberId,
    });

    if (!channel) {
      throw boundaryError(
        'CHANNEL_NOT_FOUND',
        'Channel was not found',
        404
      );
    }

    const workspaceCanManage = WORKSPACE_CHANNEL_MANAGERS.has(
      clean(requester.member_role).toUpperCase()
    );

    if (
      channel.visibility === 'PRIVATE' &&
      !channel.requester_is_member &&
      !workspaceCanManage
    ) {
      throw boundaryError(
        'CHANNEL_NOT_FOUND',
        'Channel was not found',
        404
      );
    }

    const requesterChannelRole =
      clean(channel.requester_channel_role).toUpperCase();

    return {
      channel,
      workspaceCanManage,
      requesterChannelRole,
      canManageMembers:
        workspaceCanManage ||
        CHANNEL_MEMBER_MANAGERS.has(requesterChannelRole),
    };
  }

  function channelActor(claims, conversationId) {
    const actor = requireTrustedWorkspaceClaims(claims);
    const scopedConversationId = clean(conversationId);

    if (!scopedConversationId) {
      throw boundaryError(
        'CHANNEL_CONVERSATION_REQUIRED',
        'Channel conversation is required',
        400
      );
    }

    return {
      ...actor,
      conversationId: scopedConversationId,
    };
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

  async function listChannelMembers(claims, conversationId) {
    const actor = channelActor(claims, conversationId);
    const requester = await requireActiveRequester(actor);
    const context = await requireChannelContext(actor, requester);

    const members = await repository.listChannelMembers({
      workspaceId: actor.workspaceId,
      conversationId: actor.conversationId,
    });

    const membersWithPresence = members.map((member) => ({
      ...member,
      presence_status:
        presenceRegistry?.getMemberPresence?.(
          actor.workspaceId,
          member.workspace_member_id
        )?.status || 'NOT_AVAILABLE',
    }));

    return {
      channel: {
        channel_id: context.channel.channel_id,
        conversation_id: context.channel.conversation_id,
        channel_name: context.channel.channel_name,
        visibility: context.channel.visibility,
      },
      members: membersWithPresence,
      can_manage_members: context.canManageMembers,
      requester_channel_role:
        context.requesterChannelRole || null,
    };
  }

  async function addChannelMember(claims, conversationId, input = {}) {
    const actor = channelActor(claims, conversationId);
    const requester = await requireActiveRequester(actor);
    const context = await requireChannelContext(actor, requester);

    if (!context.canManageMembers) {
      throw boundaryError(
        'CHANNEL_MEMBER_MANAGE_FORBIDDEN',
        'You cannot manage people in this channel',
        403
      );
    }

    const targetMemberId = clean(
      input.workspace_member_id ??
      input.workspaceMemberId
    );

    if (!targetMemberId) {
      throw boundaryError(
        'CHANNEL_MEMBER_TARGET_INVALID',
        'Choose a workspace member',
        400
      );
    }

    const target = await repository.getActiveWorkspaceMember({
      workspaceId: actor.workspaceId,
      workspaceMemberId: targetMemberId,
    });

    if (!target || target.identity_status !== 'ACTIVE') {
      throw boundaryError(
        'CHANNEL_MEMBER_TARGET_INVALID',
        'Workspace member was not found',
        404
      );
    }

    const member = await repository.addChannelMember({
      workspaceId: actor.workspaceId,
      conversationId: actor.conversationId,
      workspaceMemberId: targetMemberId,
    });

    if (!member) {
      throw boundaryError(
        'CHANNEL_NOT_FOUND',
        'Channel was not found',
        404
      );
    }

    return {
      member,
      can_manage_members: true,
    };
  }

  async function removeChannelMember(
    claims,
    conversationId,
    workspaceMemberId
  ) {
    const actor = channelActor(claims, conversationId);
    const requester = await requireActiveRequester(actor);
    const context = await requireChannelContext(actor, requester);

    if (!context.canManageMembers) {
      throw boundaryError(
        'CHANNEL_MEMBER_MANAGE_FORBIDDEN',
        'You cannot manage people in this channel',
        403
      );
    }

    const targetMemberId = clean(workspaceMemberId);
    if (!targetMemberId) {
      throw boundaryError(
        'CHANNEL_MEMBER_TARGET_INVALID',
        'Workspace member is required',
        400
      );
    }

    const target = await repository.getChannelMember({
      workspaceId: actor.workspaceId,
      conversationId: actor.conversationId,
      workspaceMemberId: targetMemberId,
    });

    if (!target) {
      throw boundaryError(
        'CHANNEL_MEMBER_NOT_FOUND',
        'Channel member was not found',
        404
      );
    }

    if (target.member_role === 'OWNER') {
      throw boundaryError(
        'CHANNEL_OWNER_PROTECTED',
        'Channel owners cannot be removed',
        409
      );
    }

    if (
      !context.workspaceCanManage &&
      context.requesterChannelRole === 'MODERATOR' &&
      target.member_role !== 'MEMBER'
    ) {
      throw boundaryError(
        'CHANNEL_MEMBER_MANAGE_FORBIDDEN',
        'Moderators can remove channel members only',
        403
      );
    }

    const removed = await repository.removeChannelMember({
      workspaceId: actor.workspaceId,
      conversationId: actor.conversationId,
      workspaceMemberId: targetMemberId,
    });

    if (!removed) {
      throw boundaryError(
        'CHANNEL_MEMBER_NOT_FOUND',
        'Channel member was not found',
        404
      );
    }

    return {
      removed: true,
      workspace_member_id: targetMemberId,
    };
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
    listChannelMembers,
    addChannelMember,
    removeChannelMember,
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
