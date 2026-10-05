'use strict';

const { boundaryError } = require('../core/boundaryError');

const DEFAULT_HISTORY_LIMIT = 50;
const MAX_HISTORY_LIMIT = 100;
const MAX_MESSAGE_CHARS = 8000;
const MAX_CUSTOM_STATUS_CHARS = 120;
const MAX_PRESENCE_MEMBER_IDS = 100;

function clean(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function requireTrustedWorkspaceClaims(claims = {}) {
  const workspaceId = clean(claims.workspace_id);
  const workspaceMemberId = clean(claims.workspace_member_id);
  const identityId = clean(claims.identity_id);
  if (!workspaceId || !workspaceMemberId || !identityId) {
    throw boundaryError('VERIFIED_CONTEXT_REQUIRED', 'Trusted workspace context is required', 401);
  }
  return Object.freeze({ workspaceId, workspaceMemberId, identityId });
}

function parseHistoryLimit(value) {
  if (value === undefined || value === null || value === '') return DEFAULT_HISTORY_LIMIT;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_HISTORY_LIMIT) {
    throw boundaryError(
      'MESSAGE_HISTORY_LIMIT_INVALID',
      `Message history limit must be between 1 and ${MAX_HISTORY_LIMIT}`,
      400
    );
  }
  return parsed;
}

function validateHumanMessageInput(input = {}) {
  const bodyText = clean(input.body_text ?? input.bodyText);
  const clientMessageId = clean(input.client_message_id ?? input.clientMessageId);
  const replyToMessageId = clean(input.reply_to_message_id ?? input.replyToMessageId) || null;
  const quoteMessageId = clean(input.quote_message_id ?? input.quoteMessageId) || null;
  const mentions = Array.isArray(input.mentions) ? input.mentions : [];

  if (!bodyText || bodyText.length > MAX_MESSAGE_CHARS) {
    throw boundaryError(
      'MESSAGE_BODY_INVALID',
      `Message body must contain 1 to ${MAX_MESSAGE_CHARS} characters`,
      400
    );
  }
  if (!clientMessageId || clientMessageId.length > 120) {
    throw boundaryError(
      'CLIENT_MESSAGE_ID_INVALID',
      'client_message_id must contain 1 to 120 characters',
      400
    );
  }

  if (replyToMessageId && quoteMessageId) {
    throw boundaryError(
      'MESSAGE_REPLY_MODE_CONFLICT',
      'Use either reply_to_message_id for a thread reply or quote_message_id for a quoted reply',
      400
    );
  }

  return Object.freeze({
    bodyText,
    clientMessageId,
    replyToMessageId,
    quoteMessageId,
    mentions,
  });
}

function validateSystemMessageInput(input = {}) {
  const bodyText = clean(input.body_text ?? input.bodyText);
  const sourceEventId = clean(input.source_event_id ?? input.sourceEventId);
  const messageType = clean(input.message_type ?? input.messageType ?? 'SYSTEM').toUpperCase();

  if (bodyText.length > MAX_MESSAGE_CHARS) {
    throw boundaryError('MESSAGE_BODY_INVALID', 'System message body is too large', 400);
  }
  if (!sourceEventId || sourceEventId.length > 160) {
    throw boundaryError(
      'SOURCE_EVENT_ID_INVALID',
      'source_event_id must contain 1 to 160 characters',
      400
    );
  }
  if (!['SYSTEM', 'EVENT'].includes(messageType)) {
    throw boundaryError('SYSTEM_MESSAGE_TYPE_INVALID', 'System message type must be SYSTEM or EVENT', 400);
  }
  if (!bodyText && messageType === 'SYSTEM') {
    throw boundaryError('MESSAGE_BODY_INVALID', 'SYSTEM messages require body text', 400);
  }

  return Object.freeze({ bodyText: bodyText || null, sourceEventId, messageType });
}


function normalizeStatusExpiry(value) {
  const raw = clean(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw boundaryError(
      'PRESENCE_STATUS_EXPIRY_INVALID',
      'status_expires_at must be a valid date/time',
      400
    );
  }
  return parsed.toISOString();
}

function validatePresenceProfileInput(input = {}) {
  const customStatus = clean(
    input.custom_status ?? input.customStatus
  );
  const statusExpiresAt = normalizeStatusExpiry(
    input.status_expires_at ?? input.statusExpiresAt
  );

  if (customStatus.length > MAX_CUSTOM_STATUS_CHARS) {
    throw boundaryError(
      'PRESENCE_STATUS_INVALID',
      `Custom status must not exceed ${MAX_CUSTOM_STATUS_CHARS} characters`,
      400
    );
  }

  if (!customStatus && statusExpiresAt) {
    throw boundaryError(
      'PRESENCE_STATUS_EXPIRY_INVALID',
      'Status expiry requires a custom status',
      400
    );
  }

  if (customStatus && statusExpiresAt && Date.parse(statusExpiresAt) <= Date.now()) {
    throw boundaryError(
      'PRESENCE_STATUS_EXPIRY_INVALID',
      'Status expiry must be in the future',
      400
    );
  }

  return Object.freeze({
    customStatus: customStatus || null,
    statusExpiresAt: customStatus ? statusExpiresAt : null,
  });
}

function sameNullable(left, right) {
  return (left || null) === (right || null);
}

function sameMentionSet(left = [], right = []) {
  const signature = (rows) =>
    (rows || [])
      .map((item) =>
        [
          item?.mention_type || '',
          item?.target_workspace_member_id ||
            item?.target_channel_conversation_id ||
            item?.target_id ||
            '',
        ].join(':')
      )
      .sort()
      .join('|');
  return signature(left) === signature(right);
}

function createMessagingService(repository, {
  eventPublisher = null,
  pushPublisher = null,
  attachmentCleanup = null,
} = {}) {
  if (!repository) throw new TypeError('Messaging repository is required');

  function publishRealtime(event) {
    try {
      eventPublisher?.publish?.(Object.freeze(event));
    } catch {
      // Durable persistence is authoritative; realtime fan-out is best effort.
    }
  }

  function publishPush(event) {
    try {
      const result =
        pushPublisher?.publishMessage?.(
          Object.freeze(event)
        );

      Promise.resolve(result)
        .catch(() => {});
    } catch {
      // Durable persistence remains authoritative.
    }
  }

  async function requireActiveActor(claims) {
    const actor = requireTrustedWorkspaceClaims(claims);
    const member = await repository.getActiveWorkspaceMember({
      workspaceId: actor.workspaceId,
      workspaceMemberId: actor.workspaceMemberId,
    });
    if (!member) {
      throw boundaryError('WORKSPACE_ACCESS_DENIED', 'Workspace access denied', 403);
    }
    return { actor, member };
  }

  async function requireConversationAccess(actor, conversationId) {
    const cleanConversationId = clean(conversationId);
    if (!cleanConversationId) {
      throw boundaryError('CONVERSATION_ID_REQUIRED', 'Conversation id is required', 400);
    }
    const access = await repository.getConversationAccess({
      workspaceId: actor.workspaceId,
      workspaceMemberId: actor.workspaceMemberId,
      conversationId: cleanConversationId,
    });
    if (!access) {
      throw boundaryError('CONVERSATION_ACCESS_DENIED', 'Conversation is unavailable', 404);
    }
    return { conversationId: cleanConversationId, access };
  }

  async function validateMentionTargets(actor, conversationId, source = []) {
    if (!Array.isArray(source)) return [];
    if (source.length > 20) {
      throw boundaryError('MESSAGE_MENTIONS_INVALID', 'A message can contain at most 20 mentions', 400);
    }

    const result = [];
    const seen = new Set();

    for (const raw of source) {
      const type = clean(raw?.mention_type ?? raw?.type).toUpperCase();
      const targetId = clean(
        raw?.target_id ??
        raw?.target_workspace_member_id ??
        raw?.target_channel_conversation_id
      );

      if (!targetId || !['MEMBER','CHANNEL'].includes(type)) {
        throw boundaryError('MESSAGE_MENTIONS_INVALID', 'Mention target is invalid', 400);
      }

      const key = `${type}:${targetId}`;
      if (seen.has(key)) continue;
      seen.add(key);

      if (type === 'MEMBER') {
        const member = await repository.getMentionMemberTarget({
          workspaceId: actor.workspaceId,
          conversationId,
          targetMemberId: targetId,
        });
        if (!member) {
          throw boundaryError('MESSAGE_MENTION_MEMBER_INVALID', 'Mentioned person cannot access this conversation', 400);
        }
        result.push({
          mention_type: 'MEMBER',
          target_workspace_member_id: member.workspace_member_id,
          target_channel_conversation_id: null,
          display_text: `@${member.display_name || member.primary_email || 'Member'}`,
        });
        continue;
      }

      const channel = await repository.getAccessibleChannelReference({
        workspaceId: actor.workspaceId,
        requesterMemberId: actor.workspaceMemberId,
        targetConversationId: targetId,
      });
      if (!channel) {
        throw boundaryError('MESSAGE_MENTION_CHANNEL_INVALID', 'Referenced channel is unavailable', 400);
      }
      result.push({
        mention_type: 'CHANNEL',
        target_workspace_member_id: null,
        target_channel_conversation_id: channel.conversation_id,
        display_text: `#${channel.channel_name}`,
      });
    }

    return result;
  }

  async function listMentionCandidates(claims, conversationId, input = {}) {
    const { actor } = await requireActiveActor(claims);
    const allowed = await requireConversationAccess(actor, conversationId);
    const kind = clean(input.kind || 'MEMBER').toUpperCase();
    if (!['MEMBER','CHANNEL'].includes(kind)) {
      throw boundaryError('MENTION_KIND_INVALID', 'Mention kind must be MEMBER or CHANNEL', 400);
    }
    const query = clean(input.query).slice(0, 160);
    const limit = Math.max(1, Math.min(20, Number(input.limit || 10) || 10));
    return {
      mention_candidates: await repository.listMentionCandidates({
        workspaceId: actor.workspaceId,
        conversationId: allowed.conversationId,
        requesterMemberId: actor.workspaceMemberId,
        kind,
        query,
        limit,
      }),
    };
  }

  async function listMessages(claims, conversationId, options = {}) {
    const { actor } = await requireActiveActor(claims);
    const allowed = await requireConversationAccess(actor, conversationId);
    const limit = parseHistoryLimit(options.limit);
    const beforeMessageId = clean(options.before_message_id ?? options.beforeMessageId) || null;

    const page = await repository.listMessages({
      workspaceId: actor.workspaceId,
      conversationId: allowed.conversationId,
      workspaceMemberId: actor.workspaceMemberId,
      limit,
      beforeMessageId,
    });
    if (page.cursorInvalid) {
      throw boundaryError('MESSAGE_HISTORY_CURSOR_INVALID', 'Message history cursor is invalid', 400);
    }

    return {
      messages: page.rows,
      page: {
        limit,
        has_more: page.hasMore,
        next_before_message_id: page.nextBeforeMessageId,
      },
    };
  }



  async function searchConversationMessages(claims, conversationId, options = {}) {
    const { actor } = await requireActiveActor(claims);
    const allowed = await requireConversationAccess(actor, conversationId);
    const query = clean(options.query);
    if (!query) {
      throw boundaryError('MESSAGE_SEARCH_QUERY_REQUIRED', 'Search text is required', 400);
    }
    const limit = Math.max(1, Math.min(50, Number(options.limit || 50) || 50));
    const messages = await repository.searchConversationMessages({
      workspaceId: actor.workspaceId,
      conversationId: allowed.conversationId,
      workspaceMemberId: actor.workspaceMemberId,
      query,
      limit,
    });
    return { query, messages };
  }

  async function toggleMessageReaction(claims, conversationId, messageId, input = {}) {
    const { actor } = await requireActiveActor(claims);
    const allowed = await requireConversationAccess(actor, conversationId);
    const cleanMessageId = clean(messageId);
    const emoji = clean(input.emoji);
    const allowedEmoji = new Set(['👍', '❤️', '😂', '🎉', '👀', '✅']);
    if (!cleanMessageId || !allowedEmoji.has(emoji)) {
      throw boundaryError('MESSAGE_REACTION_INVALID', 'Choose a supported reaction', 400);
    }
    const message = await repository.getMessageInConversation({
      workspaceId: actor.workspaceId,
      conversationId: allowed.conversationId,
      messageId: cleanMessageId,
    });
    if (!message || message.deleted_at) {
      throw boundaryError('MESSAGE_NOT_FOUND', 'Message is unavailable', 404);
    }
    const reactions = await repository.toggleMessageReaction({
      workspaceId: actor.workspaceId,
      conversationId: allowed.conversationId,
      messageId: cleanMessageId,
      workspaceMemberId: actor.workspaceMemberId,
      emoji,
    });
    publishRealtime({
      type: 'message.reaction.updated',
      workspace_id: actor.workspaceId,
      conversation_id: allowed.conversationId,
      message_id: cleanMessageId,
      reactions,
    });
    return { message_id: cleanMessageId, reactions };
  }

  async function listMessageReactionUsers(claims, conversationId, messageId) {
    const { actor } = await requireActiveActor(claims);
    const allowed = await requireConversationAccess(actor, conversationId);
    const cleanMessageId = clean(messageId);
    if (!cleanMessageId) {
      throw boundaryError('MESSAGE_ID_REQUIRED', 'Message id is required', 400);
    }
    const reactions = await repository.listMessageReactionUsers({
      workspaceId: actor.workspaceId,
      conversationId: allowed.conversationId,
      messageId: cleanMessageId,
    });
    return { message_id: cleanMessageId, reactions };
  }

  async function listThread(claims, conversationId, parentMessageId) {
    const { actor } = await requireActiveActor(claims);
    const allowed = await requireConversationAccess(actor, conversationId);
    const cleanParentMessageId = clean(parentMessageId);

    if (!cleanParentMessageId) {
      throw boundaryError(
        'THREAD_PARENT_MESSAGE_REQUIRED',
        'Thread parent message id is required',
        400
      );
    }

    const thread = await repository.listThread({
      workspaceId: actor.workspaceId,
      conversationId: allowed.conversationId,
      parentMessageId: cleanParentMessageId,
      workspaceMemberId: actor.workspaceMemberId,
    });

    if (!thread) {
      throw boundaryError(
        'THREAD_PARENT_NOT_FOUND',
        'Thread parent message is unavailable',
        404
      );
    }

    return thread;
  }

  async function sendHumanMessage(claims, conversationId, input = {}) {
    const { actor } = await requireActiveActor(claims);
    const allowed = await requireConversationAccess(actor, conversationId);
    const message = validateHumanMessageInput(input);
    const mentionRows = await validateMentionTargets(
      actor,
      allowed.conversationId,
      message.mentions
    );

    if (message.replyToMessageId) {
      const reply = await repository.getMessageInConversation({
        workspaceId: actor.workspaceId,
        conversationId: allowed.conversationId,
        messageId: message.replyToMessageId,
      });
      if (!reply || reply.deleted_at) {
        throw boundaryError('MESSAGE_REPLY_INVALID', 'Reply target is invalid', 400);
      }
      if (reply.reply_to_message_id) {
        throw boundaryError(
          'MESSAGE_REPLY_NESTED_INVALID',
          'Replies must target the thread root message',
          400
        );
      }
    }

    if (message.quoteMessageId) {
      const quote = await repository.getMessageInConversation({
        workspaceId: actor.workspaceId,
        conversationId: allowed.conversationId,
        messageId: message.quoteMessageId,
      });
      if (!quote || quote.deleted_at) {
        throw boundaryError(
          'MESSAGE_QUOTE_INVALID',
          'Quoted message is unavailable',
          400
        );
      }
    }

    const existing = await repository.findHumanMessageByClientId({
      workspaceId: actor.workspaceId,
      conversationId: allowed.conversationId,
      clientMessageId: message.clientMessageId,
    });

    if (existing) {
      if (
        existing.sender_type !== 'HUMAN' ||
        existing.sender_member_id !== actor.workspaceMemberId ||
        existing.body_text !== message.bodyText ||
        !sameNullable(existing.reply_to_message_id, message.replyToMessageId) ||
        !sameNullable(existing.quote_message_id, message.quoteMessageId) ||
        !sameMentionSet(existing.mentions, mentionRows)
      ) {
        throw boundaryError(
          'MESSAGE_IDEMPOTENCY_CONFLICT',
          'client_message_id is already bound to a different message',
          409
        );
      }
      return { created: false, message: existing };
    }

    try {
      const created = await repository.createHumanMessage({
        workspaceId: actor.workspaceId,
        conversationId: allowed.conversationId,
        senderMemberId: actor.workspaceMemberId,
        bodyText: message.bodyText,
        clientMessageId: message.clientMessageId,
        replyToMessageId: message.replyToMessageId,
        quoteMessageId: message.quoteMessageId,
        mentions: mentionRows,
      });
      publishRealtime({
        type: 'message.created',
        workspace_id: actor.workspaceId,
        conversation_id: allowed.conversationId,
        message: created,
      });
      publishPush({
        workspaceId: actor.workspaceId,
        conversationId: allowed.conversationId,
        message: created,
        excludeWorkspaceMemberId:
          actor.workspaceMemberId,
      });
      return { created: true, message: created };
    } catch (error) {
      if (error?.code === '23505' && error?.constraint === 'uq_ac_message_client_id') {
        const winner = await repository.findHumanMessageByClientId({
          workspaceId: actor.workspaceId,
          conversationId: allowed.conversationId,
          clientMessageId: message.clientMessageId,
        });
        if (
          winner &&
          winner.sender_type === 'HUMAN' &&
          winner.sender_member_id === actor.workspaceMemberId &&
          winner.body_text === message.bodyText &&
          sameNullable(winner.reply_to_message_id, message.replyToMessageId) &&
          sameNullable(winner.quote_message_id, message.quoteMessageId) &&
          sameMentionSet(winner.mentions, mentionRows)
        ) {
          return { created: false, message: winner };
        }
        throw boundaryError(
          'MESSAGE_IDEMPOTENCY_CONFLICT',
          'client_message_id is already bound to a different message',
          409
        );
      }
      if (error?.code === '23503' && error?.constraint === 'fk_ac_message_reply') {
        throw boundaryError('MESSAGE_REPLY_INVALID', 'Reply target is invalid', 400);
      }
      if (error?.code === '23503' && error?.constraint === 'fk_ac_message_quote') {
        throw boundaryError('MESSAGE_QUOTE_INVALID', 'Quoted message is unavailable', 400);
      }
      if (error?.code === '23514' && error?.constraint === 'ck_ac_message_quote_not_self') {
        throw boundaryError('MESSAGE_QUOTE_INVALID', 'A message cannot quote itself', 400);
      }
      throw error;
    }
  }

  async function editHumanMessage(
    claims,
    conversationId,
    messageId,
    input = {}
  ) {
    const { actor } =
      await requireActiveActor(claims);

    const allowed =
      await requireConversationAccess(
        actor,
        conversationId
      );

    const cleanMessageId =
      clean(messageId);

    if (!cleanMessageId) {
      throw boundaryError(
        'MESSAGE_ID_REQUIRED',
        'Message id is required',
        400
      );
    }

    const bodyText =
      clean(
        input.body_text ??
        input.bodyText
      );

    if (
      !bodyText ||
      bodyText.length > MAX_MESSAGE_CHARS
    ) {
      throw boundaryError(
        'MESSAGE_BODY_INVALID',
        `Message body must contain 1 to ${MAX_MESSAGE_CHARS} characters`,
        400
      );
    }

    const mentionRows =
      Array.isArray(input.mentions)
        ? await validateMentionTargets(
            actor,
            allowed.conversationId,
            input.mentions
          )
        : null;

    const result =
      await repository
        .updateHumanTextMessage({
          workspaceId:
            actor.workspaceId,
          conversationId:
            allowed.conversationId,
          messageId:
            cleanMessageId,
          editorMemberId:
            actor.workspaceMemberId,
          bodyText,
          mentions: mentionRows,
        });

    if (
      result?.status === 'NOT_FOUND' ||
      result?.status === 'NOT_OWNER'
    ) {
      throw boundaryError(
        'MESSAGE_MUTATION_DENIED',
        'Message is unavailable',
        404
      );
    }

    if (result?.status === 'NOT_TEXT') {
      throw boundaryError(
        'MESSAGE_EDIT_NOT_ALLOWED',
        'Only text messages can be edited',
        409
      );
    }

    if (result?.status === 'DELETED') {
      throw boundaryError(
        'MESSAGE_ALREADY_DELETED',
        'Deleted messages cannot be edited',
        409
      );
    }

    const changed =
      result?.status === 'UPDATED';

    if (
      changed &&
      result?.message
    ) {
      publishRealtime({
        type: 'message.updated',
        workspace_id:
          actor.workspaceId,
        conversation_id:
          allowed.conversationId,
        message:
          result.message,
      });
    }

    return {
      updated: changed,
      message:
        result?.message || null,
    };
  }

  async function deleteHumanMessage(
    claims,
    conversationId,
    messageId
  ) {
    const { actor } =
      await requireActiveActor(claims);

    const allowed =
      await requireConversationAccess(
        actor,
        conversationId
      );

    const cleanMessageId =
      clean(messageId);

    if (!cleanMessageId) {
      throw boundaryError(
        'MESSAGE_ID_REQUIRED',
        'Message id is required',
        400
      );
    }

    const result =
      await repository
        .softDeleteHumanMessage({
          workspaceId:
            actor.workspaceId,
          conversationId:
            allowed.conversationId,
          messageId:
            cleanMessageId,
          senderMemberId:
            actor.workspaceMemberId,
        });

    if (
      result?.status === 'NOT_FOUND' ||
      result?.status === 'NOT_OWNER'
    ) {
      throw boundaryError(
        'MESSAGE_MUTATION_DENIED',
        'Message is unavailable',
        404
      );
    }

    const changed =
      result?.status === 'DELETED';

    let message =
      result?.message || null;

    if (
      changed &&
      message?.message_type ===
        'ATTACHMENT'
    ) {
      try {
        await attachmentCleanup
          ?.purgeDeletedMessage?.({
            workspaceId:
              actor.workspaceId,
            conversationId:
              allowed.conversationId,
            messageId:
              cleanMessageId,
          });
      } catch {
        // deleted_at already revokes access. Blob/metadata cleanup is best effort.
      }

      message = {
        ...message,
        attachments: [],
      };
    }

    if (
      changed &&
      message
    ) {
      publishRealtime({
        type: 'message.deleted',
        workspace_id:
          actor.workspaceId,
        conversation_id:
          allowed.conversationId,
        message,
      });
    }

    return {
      deleted: changed,
      message,
    };
  }

  async function getThreadReadCursor(claims, conversationId, parentMessageId) {
    const { actor } = await requireActiveActor(claims);
    const allowed = await requireConversationAccess(actor, conversationId);
    const cleanParentMessageId = clean(parentMessageId);
    if (!cleanParentMessageId) {
      throw boundaryError(
        'THREAD_PARENT_MESSAGE_REQUIRED',
        'Thread parent message id is required',
        400
      );
    }

    const parent = await repository.getMessageInConversation({
      workspaceId: actor.workspaceId,
      conversationId: allowed.conversationId,
      messageId: cleanParentMessageId,
    });
    if (!parent || parent.reply_to_message_id) {
      throw boundaryError('THREAD_PARENT_NOT_FOUND', 'Thread parent message is unavailable', 404);
    }

    const cursor = await repository.getThreadReadCursor({
      workspaceId: actor.workspaceId,
      conversationId: allowed.conversationId,
      parentMessageId: cleanParentMessageId,
      workspaceMemberId: actor.workspaceMemberId,
    });
    return { thread_read_cursor: cursor };
  }

  async function advanceThreadReadCursor(
    claims,
    conversationId,
    parentMessageId,
    input = {}
  ) {
    const { actor } = await requireActiveActor(claims);
    const allowed = await requireConversationAccess(actor, conversationId);
    const cleanParentMessageId = clean(parentMessageId);
    const lastReadMessageId = clean(
      input.last_read_message_id ?? input.lastReadMessageId
    );

    if (!cleanParentMessageId) {
      throw boundaryError('THREAD_PARENT_MESSAGE_REQUIRED', 'Thread parent message id is required', 400);
    }
    if (!lastReadMessageId) {
      throw boundaryError('THREAD_READ_CURSOR_MESSAGE_REQUIRED', 'last_read_message_id is required', 400);
    }

    const parent = await repository.getMessageInConversation({
      workspaceId: actor.workspaceId,
      conversationId: allowed.conversationId,
      messageId: cleanParentMessageId,
    });
    if (!parent || parent.reply_to_message_id) {
      throw boundaryError('THREAD_PARENT_NOT_FOUND', 'Thread parent message is unavailable', 404);
    }

    const reply = await repository.getMessageInConversation({
      workspaceId: actor.workspaceId,
      conversationId: allowed.conversationId,
      messageId: lastReadMessageId,
    });
    if (!reply || reply.reply_to_message_id !== cleanParentMessageId) {
      throw boundaryError(
        'THREAD_READ_CURSOR_MESSAGE_INVALID',
        'Thread read cursor message is invalid',
        400
      );
    }

    const cursor = await repository.advanceThreadReadCursor({
      workspaceId: actor.workspaceId,
      conversationId: allowed.conversationId,
      parentMessageId: cleanParentMessageId,
      workspaceMemberId: actor.workspaceMemberId,
      lastReadMessageId,
    });

    if (cursor) {
      publishRealtime({
        type: 'thread_read_cursor.updated',
        workspace_id: actor.workspaceId,
        workspace_member_id: actor.workspaceMemberId,
        conversation_id: allowed.conversationId,
        thread_root_message_id: cleanParentMessageId,
        last_read_message_id: cursor.last_read_message_id,
        read_at: cursor.read_at || null,
      });
    }

    return { thread_read_cursor: cursor };
  }

  async function getReadCursor(claims, conversationId) {
    const { actor } = await requireActiveActor(claims);
    const allowed = await requireConversationAccess(actor, conversationId);
    const cursor = await repository.getReadCursor({
      workspaceId: actor.workspaceId,
      conversationId: allowed.conversationId,
      workspaceMemberId: actor.workspaceMemberId,
    });
    return { read_cursor: cursor };
  }

  async function advanceReadCursor(claims, conversationId, input = {}) {
    const { actor } = await requireActiveActor(claims);
    const allowed = await requireConversationAccess(actor, conversationId);
    const lastReadMessageId = clean(
      input.last_read_message_id ?? input.lastReadMessageId
    );
    if (!lastReadMessageId) {
      throw boundaryError('READ_CURSOR_MESSAGE_REQUIRED', 'last_read_message_id is required', 400);
    }

    const message = await repository.getMessageInConversation({
      workspaceId: actor.workspaceId,
      conversationId: allowed.conversationId,
      messageId: lastReadMessageId,
    });
    if (!message || message.reply_to_message_id) {
      throw boundaryError(
        'READ_CURSOR_MESSAGE_INVALID',
        'Read cursor message must be a main conversation message',
        400
      );
    }

    const cursor = await repository.advanceReadCursor({
      workspaceId: actor.workspaceId,
      conversationId: allowed.conversationId,
      workspaceMemberId: actor.workspaceMemberId,
      lastReadMessageId,
    });
    if (cursor) {
      publishRealtime({
        type: 'read_cursor.updated',
        workspace_id: actor.workspaceId,
        workspace_member_id: actor.workspaceMemberId,
        conversation_id: allowed.conversationId,
        last_read_message_id: cursor.last_read_message_id,
        read_at: cursor.read_at || null,
      });
    }
    return { read_cursor: cursor };
  }

  async function listUnreadCounts(claims) {
    const { actor } = await requireActiveActor(claims);
    const rows = await repository.listUnreadCounts({
      workspaceId: actor.workspaceId,
      workspaceMemberId: actor.workspaceMemberId,
    });
    return {
      unread_counts: (rows || []).map((row) => ({
        conversation_id: row.conversation_id,
        unread_count: Number(row.unread_count || 0),
      })),
    };
  }

  async function getOwnPresenceProfile(claims) {
    const { actor } = await requireActiveActor(claims);
    return {
      presence_profile: await repository.getMemberPresenceProfile({
        workspaceId: actor.workspaceId,
        workspaceMemberId: actor.workspaceMemberId,
      }),
    };
  }

  async function updateOwnPresenceProfile(claims, input = {}) {
    const { actor } = await requireActiveActor(claims);
    const profile = validatePresenceProfileInput(input);

    const saved = await repository.updateMemberPresenceProfile({
      workspaceId: actor.workspaceId,
      workspaceMemberId: actor.workspaceMemberId,
      customStatus: profile.customStatus,
      statusExpiresAt: profile.statusExpiresAt,
    });

    publishRealtime({
      type: 'presence.profile.updated',
      workspace_id: actor.workspaceId,
      workspace_member_id: actor.workspaceMemberId,
      profile: saved,
    });

    return { presence_profile: saved };
  }

  async function listPresenceProfiles(claims, input = {}) {
    const { actor } = await requireActiveActor(claims);
    const source = input.workspace_member_ids ?? input.workspaceMemberIds ?? [];
    const ids = Array.isArray(source)
      ? [...new Set(source.map(clean).filter(Boolean))]
      : clean(source).split(',').map(clean).filter(Boolean);

    if (!ids.length || ids.length > MAX_PRESENCE_MEMBER_IDS) {
      throw boundaryError(
        'PRESENCE_MEMBER_IDS_INVALID',
        `workspace_member_ids must contain 1 to ${MAX_PRESENCE_MEMBER_IDS} members`,
        400
      );
    }

    return {
      presence_profiles: await repository.listMemberPresenceProfiles({
        workspaceId: actor.workspaceId,
        workspaceMemberIds: ids,
      }),
    };
  }

  async function publishTrustedSystemMessage(authority = {}, conversationId, input = {}) {
    const workspaceId = clean(authority.workspace_id ?? authority.workspaceId);
    const systemSenderId = clean(authority.system_sender_id ?? authority.systemSenderId);
    if (authority.trusted_system_sender !== true || !workspaceId || !systemSenderId) {
      throw boundaryError('SYSTEM_SENDER_AUTHORITY_REQUIRED', 'Trusted SystemSender authority is required', 401);
    }

    const cleanConversationId = clean(conversationId);
    if (!cleanConversationId) {
      throw boundaryError('CONVERSATION_ID_REQUIRED', 'Conversation id is required', 400);
    }
    const [sender, conversation] = await Promise.all([
      repository.getActiveSystemSender({ workspaceId, systemSenderId }),
      repository.getActiveConversation({ workspaceId, conversationId: cleanConversationId }),
    ]);
    if (!sender || !conversation) {
      throw boundaryError('SYSTEM_MESSAGE_TARGET_INVALID', 'System message target is invalid', 404);
    }

    const message = validateSystemMessageInput(input);
    const existing = await repository.findSystemMessageBySourceEvent({
      workspaceId,
      conversationId: cleanConversationId,
      systemSenderId,
      sourceEventId: message.sourceEventId,
    });
    if (existing) {
      if (
        existing.message_type !== message.messageType ||
        !sameNullable(existing.body_text, message.bodyText)
      ) {
        throw boundaryError(
          'SYSTEM_MESSAGE_IDEMPOTENCY_CONFLICT',
          'source_event_id is already bound to a different system message',
          409
        );
      }
      return { created: false, message: existing };
    }

    try {
      const created = await repository.createSystemMessage({
        workspaceId,
        conversationId: cleanConversationId,
        systemSenderId,
        sourceEventId: message.sourceEventId,
        bodyText: message.bodyText,
        messageType: message.messageType,
      });
      publishRealtime({
        type: 'message.created',
        workspace_id: workspaceId,
        conversation_id: cleanConversationId,
        message: created,
      });
      publishPush({
        workspaceId,
        conversationId: cleanConversationId,
        message: created,
        excludeWorkspaceMemberId: null,
      });
      return { created: true, message: created };
    } catch (error) {
      if (error?.code === '23505' && error?.constraint === 'uq_ac_message_system_source_event') {
        const winner = await repository.findSystemMessageBySourceEvent({
          workspaceId,
          conversationId: cleanConversationId,
          systemSenderId,
          sourceEventId: message.sourceEventId,
        });
        if (
          winner &&
          winner.message_type === message.messageType &&
          sameNullable(winner.body_text, message.bodyText)
        ) {
          return { created: false, message: winner };
        }
        throw boundaryError(
          'SYSTEM_MESSAGE_IDEMPOTENCY_CONFLICT',
          'source_event_id is already bound to a different system message',
          409
        );
      }
      throw error;
    }
  }

  return Object.freeze({
    listMessages,
    searchConversationMessages,
    listMentionCandidates,
    toggleMessageReaction,
    listMessageReactionUsers,
    listThread,
    getThreadReadCursor,
    advanceThreadReadCursor,
    sendHumanMessage,
    editHumanMessage,
    deleteHumanMessage,
    getReadCursor,
    advanceReadCursor,
    listUnreadCounts,
    getOwnPresenceProfile,
    updateOwnPresenceProfile,
    listPresenceProfiles,
    publishTrustedSystemMessage,
  });
}

module.exports = {
  DEFAULT_HISTORY_LIMIT,
  MAX_HISTORY_LIMIT,
  MAX_MESSAGE_CHARS,
  MAX_CUSTOM_STATUS_CHARS,
  MAX_PRESENCE_MEMBER_IDS,
  validatePresenceProfileInput,
  parseHistoryLimit,
  validateHumanMessageInput,
  validateSystemMessageInput,
  requireTrustedWorkspaceClaims,
  createMessagingService,
};
