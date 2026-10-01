'use strict';

const { boundaryError } = require('../core/boundaryError');

const WORKSPACE_MANAGERS = new Set(['OWNER', 'ADMIN']);
const CHANNEL_MANAGERS = new Set(['OWNER', 'MODERATOR']);

function clean(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function requireActor(claims = {}) {
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

  return {
    workspaceId,
    workspaceMemberId,
    identityId,
  };
}

function createConversationPlatformService(repository) {
  if (!repository) {
    throw new TypeError('Conversation platform repository is required');
  }

  async function requireAccess(claims, conversationId) {
    const actor = requireActor(claims);
    const cleanConversationId = clean(conversationId);

    if (!cleanConversationId) {
      throw boundaryError(
        'CONVERSATION_ID_REQUIRED',
        'Conversation id is required',
        400
      );
    }

    const context = await repository.getConversationContext({
      workspaceId: actor.workspaceId,
      conversationId: cleanConversationId,
      requesterMemberId: actor.workspaceMemberId,
    });

    if (
      !context ||
      context.requester_workspace_status !== 'ACTIVE'
    ) {
      throw boundaryError(
        'CONVERSATION_ACCESS_DENIED',
        'Conversation is unavailable',
        404
      );
    }

    const workspaceRole = clean(
      context.requester_workspace_role
    ).toUpperCase();

    const workspaceCanManage =
      WORKSPACE_MANAGERS.has(workspaceRole);

    if (context.conversation_type === 'CHANNEL') {
      if (
        context.channel_status !== 'ACTIVE' ||
        !context.requester_is_channel_member
      ) {
        throw boundaryError(
          'CONVERSATION_ACCESS_DENIED',
          'Conversation is unavailable',
          404
        );
      }
    } else if (
      !context.requester_is_participant
    ) {
      throw boundaryError(
        'CONVERSATION_ACCESS_DENIED',
        'Conversation is unavailable',
        404
      );
    }

    const channelRole = clean(
      context.requester_channel_role
    ).toUpperCase();

    return {
      actor,
      context,
      workspaceCanManage,
      canManageChannel:
        context.conversation_type === 'CHANNEL' &&
        (
          workspaceCanManage ||
          CHANNEL_MANAGERS.has(channelRole)
        ),
    };
  }

  async function getDetails(claims, conversationId) {
    const access = await requireAccess(claims, conversationId);

    const rules =
      access.context.conversation_type === 'CHANNEL'
        ? await repository.listChannelRules({
            workspaceId: access.actor.workspaceId,
            conversationId: access.context.conversation_id,
          })
        : [];

    const setting =
      await repository.getConversationSetting({
        workspaceId: access.actor.workspaceId,
        conversationId: access.context.conversation_id,
        workspaceMemberId: access.actor.workspaceMemberId,
      });

    return {
      conversation: {
        conversation_id: access.context.conversation_id,
        conversation_type: access.context.conversation_type,
        created_at: access.context.conversation_created_at,
        created_by_member_id: access.context.created_by_member_id,
        creator_display_name: access.context.creator_display_name || null,
      },
      channel:
        access.context.conversation_type === 'CHANNEL'
          ? {
              channel_id: access.context.channel_id,
              channel_code: access.context.channel_code,
              channel_name: access.context.channel_name,
              visibility: access.context.visibility,
              description: access.context.description || '',
              topic: access.context.topic || '',
              requester_channel_role:
                access.context.requester_channel_role || null,
            }
          : null,
      peer:
        access.context.conversation_type === 'CHANNEL'
          ? null
          : {
              workspace_member_id:
                access.context.peer_workspace_member_id || null,
              identity_id:
                access.context.peer_identity_id || null,
              display_name:
                access.context.peer_display_name || null,
              primary_email:
                access.context.peer_primary_email || null,
            },
      rules,
      setting,
      permissions: {
        can_manage_channel: access.canManageChannel,
        can_pin: true,
      },
      tabs:
        access.context.conversation_type === 'CHANNEL'
          ? ['OVERVIEW', 'PEOPLE', 'SHARED', 'PINS', 'SETTINGS']
          : ['OVERVIEW', 'SHARED', 'PINS', 'SETTINGS'],
    };
  }

  async function updateChannelProfile(
    claims,
    conversationId,
    input = {}
  ) {
    const access = await requireAccess(claims, conversationId);

    if (
      access.context.conversation_type !== 'CHANNEL' ||
      !access.canManageChannel
    ) {
      throw boundaryError(
        'CHANNEL_PROFILE_FORBIDDEN',
        'You cannot edit this channel',
        403
      );
    }

    const channelName = clean(
      input.channel_name ??
      input.channelName ??
      access.context.channel_name
    );

    const description = clean(
      input.description
    );

    const topic = clean(
      input.topic
    );

    if (!channelName || channelName.length > 160) {
      throw boundaryError(
        'CHANNEL_NAME_INVALID',
        'Channel name must contain 1 to 160 characters',
        400
      );
    }

    if (description.length > 4000) {
      throw boundaryError(
        'CHANNEL_DESCRIPTION_INVALID',
        'Channel description must not exceed 4000 characters',
        400
      );
    }

    if (topic.length > 240) {
      throw boundaryError(
        'CHANNEL_TOPIC_INVALID',
        'Channel topic must not exceed 240 characters',
        400
      );
    }

    const channel = await repository.updateChannelProfile({
      workspaceId: access.actor.workspaceId,
      conversationId: access.context.conversation_id,
      channelName,
      description,
      topic,
    });

    if (!channel) {
      throw boundaryError(
        'CHANNEL_NOT_FOUND',
        'Channel was not found',
        404
      );
    }

    return { channel };
  }

  async function replaceChannelRules(
    claims,
    conversationId,
    input = {}
  ) {
    const access = await requireAccess(claims, conversationId);

    if (
      access.context.conversation_type !== 'CHANNEL' ||
      !access.canManageChannel
    ) {
      throw boundaryError(
        'CHANNEL_RULES_FORBIDDEN',
        'You cannot edit channel rules',
        403
      );
    }

    const rawRules = Array.isArray(input.rules)
      ? input.rules
      : [];

    const rules = rawRules
      .map((rule) => clean(rule))
      .filter(Boolean);

    if (rules.length > 50) {
      throw boundaryError(
        'CHANNEL_RULES_INVALID',
        'A channel may contain at most 50 active rules',
        400
      );
    }

    if (rules.some((rule) => rule.length > 1000)) {
      throw boundaryError(
        'CHANNEL_RULES_INVALID',
        'Each rule must not exceed 1000 characters',
        400
      );
    }

    await repository.replaceChannelRules({
      workspaceId: access.actor.workspaceId,
      conversationId: access.context.conversation_id,
      actorMemberId: access.actor.workspaceMemberId,
      rules,
    });

    return {
      rules: await repository.listChannelRules({
        workspaceId: access.actor.workspaceId,
        conversationId: access.context.conversation_id,
      }),
    };
  }

  async function listShared(claims, conversationId, kind) {
    const access = await requireAccess(claims, conversationId);
    const normalizedKind = clean(kind || 'MEDIA').toUpperCase();

    if (!['MEDIA', 'FILES', 'LINKS'].includes(normalizedKind)) {
      throw boundaryError(
        'SHARED_KIND_INVALID',
        'Shared kind must be MEDIA, FILES or LINKS',
        400
      );
    }

    if (normalizedKind === 'LINKS') {
      return {
        kind: normalizedKind,
        items: await repository.listSharedLinks({
          workspaceId: access.actor.workspaceId,
          conversationId: access.context.conversation_id,
        }),
      };
    }

    const attachments = await repository.listSharedAttachments({
      workspaceId: access.actor.workspaceId,
      conversationId: access.context.conversation_id,
    });

    return {
      kind: normalizedKind,
      items: attachments.filter(
        (item) => item.shared_kind === normalizedKind
      ),
    };
  }

  async function listPins(claims, conversationId) {
    const access = await requireAccess(claims, conversationId);

    const [pins, candidates] = await Promise.all([
      repository.listConversationPins({
        workspaceId: access.actor.workspaceId,
        conversationId: access.context.conversation_id,
      }),
      repository.listRecentPinCandidates({
        workspaceId: access.actor.workspaceId,
        conversationId: access.context.conversation_id,
      }),
    ]);

    return {
      pins,
      candidates,
      can_pin: true,
    };
  }

  async function pinMessage(
    claims,
    conversationId,
    messageId
  ) {
    const access = await requireAccess(claims, conversationId);
    const cleanMessageId = clean(messageId);

    if (!cleanMessageId) {
      throw boundaryError(
        'PIN_MESSAGE_REQUIRED',
        'Message id is required',
        400
      );
    }

    const pin = await repository.addConversationPin({
      workspaceId: access.actor.workspaceId,
      conversationId: access.context.conversation_id,
      messageId: cleanMessageId,
      actorMemberId: access.actor.workspaceMemberId,
    });

    if (!pin) {
      throw boundaryError(
        'PIN_MESSAGE_NOT_FOUND',
        'Message was not found',
        404
      );
    }

    return { pin };
  }

  async function unpinMessage(
    claims,
    conversationId,
    messageId
  ) {
    const access = await requireAccess(claims, conversationId);

    return {
      removed: await repository.removeConversationPin({
        workspaceId: access.actor.workspaceId,
        conversationId: access.context.conversation_id,
        messageId: clean(messageId),
      }),
    };
  }

  async function getSetting(claims, conversationId) {
    const access = await requireAccess(claims, conversationId);

    return {
      setting: await repository.getConversationSetting({
        workspaceId: access.actor.workspaceId,
        conversationId: access.context.conversation_id,
        workspaceMemberId: access.actor.workspaceMemberId,
      }),
    };
  }

  async function updateSetting(
    claims,
    conversationId,
    input = {}
  ) {
    const access = await requireAccess(claims, conversationId);

    const notificationLevel = clean(
      input.notification_level ??
      input.notificationLevel ??
      'ALL'
    ).toUpperCase();

    if (!['ALL', 'NONE'].includes(notificationLevel)) {
      throw boundaryError(
        'CONVERSATION_SETTING_INVALID',
        'notification_level must be ALL or NONE',
        400
      );
    }

    let mutedUntil = null;

    if (input.muted_until ?? input.mutedUntil) {
      const date = new Date(
        input.muted_until ??
        input.mutedUntil
      );

      if (Number.isNaN(date.getTime())) {
        throw boundaryError(
          'CONVERSATION_SETTING_INVALID',
          'muted_until must be a valid date/time',
          400
        );
      }

      mutedUntil = date.toISOString();
    }

    return {
      setting: await repository.upsertConversationSetting({
        workspaceId: access.actor.workspaceId,
        conversationId: access.context.conversation_id,
        workspaceMemberId: access.actor.workspaceMemberId,
        notificationLevel,
        mutedUntil,
      }),
    };
  }

  return Object.freeze({
    getDetails,
    updateChannelProfile,
    replaceChannelRules,
    listShared,
    listPins,
    pinMessage,
    unpinMessage,
    getSetting,
    updateSetting,
  });
}

module.exports = {
  createConversationPlatformService,
};
