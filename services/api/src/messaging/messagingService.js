'use strict';

const { boundaryError } = require('../core/boundaryError');

const DEFAULT_HISTORY_LIMIT = 50;
const MAX_HISTORY_LIMIT = 100;
const MAX_MESSAGE_CHARS = 8000;

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

  return Object.freeze({ bodyText, clientMessageId, replyToMessageId });
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

function sameNullable(left, right) {
  return (left || null) === (right || null);
}

function createMessagingService(repository, { eventPublisher = null } = {}) {
  if (!repository) throw new TypeError('Messaging repository is required');

  function publishRealtime(event) {
    try {
      eventPublisher?.publish?.(Object.freeze(event));
    } catch {
      // Durable persistence is authoritative; realtime fan-out is best effort.
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

  async function listMessages(claims, conversationId, options = {}) {
    const { actor } = await requireActiveActor(claims);
    const allowed = await requireConversationAccess(actor, conversationId);
    const limit = parseHistoryLimit(options.limit);
    const beforeMessageId = clean(options.before_message_id ?? options.beforeMessageId) || null;

    const page = await repository.listMessages({
      workspaceId: actor.workspaceId,
      conversationId: allowed.conversationId,
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

  async function sendHumanMessage(claims, conversationId, input = {}) {
    const { actor } = await requireActiveActor(claims);
    const allowed = await requireConversationAccess(actor, conversationId);
    const message = validateHumanMessageInput(input);

    if (message.replyToMessageId) {
      const reply = await repository.getMessageInConversation({
        workspaceId: actor.workspaceId,
        conversationId: allowed.conversationId,
        messageId: message.replyToMessageId,
      });
      if (!reply) {
        throw boundaryError('MESSAGE_REPLY_INVALID', 'Reply target is invalid', 400);
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
        !sameNullable(existing.reply_to_message_id, message.replyToMessageId)
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
      });
      publishRealtime({
        type: 'message.created',
        workspace_id: actor.workspaceId,
        conversation_id: allowed.conversationId,
        message: created,
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
          sameNullable(winner.reply_to_message_id, message.replyToMessageId)
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
      throw error;
    }
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
    if (!message) {
      throw boundaryError('READ_CURSOR_MESSAGE_INVALID', 'Read cursor message is invalid', 400);
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
    sendHumanMessage,
    getReadCursor,
    advanceReadCursor,
    listUnreadCounts,
    publishTrustedSystemMessage,
  });
}

module.exports = {
  DEFAULT_HISTORY_LIMIT,
  MAX_HISTORY_LIMIT,
  MAX_MESSAGE_CHARS,
  parseHistoryLimit,
  validateHumanMessageInput,
  validateSystemMessageInput,
  requireTrustedWorkspaceClaims,
  createMessagingService,
};
