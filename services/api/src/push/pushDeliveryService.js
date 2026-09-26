'use strict';

function clean(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return '';
  }

  return String(value).trim();
}

function preview(message) {
  const body =
    clean(message?.body_text);

  if (body) {
    return body.length > 180
      ? `${body.slice(0, 177)}...`
      : body;
  }

  if (
    message?.message_type ===
    'ATTACHMENT'
  ) {
    return 'Sent an attachment';
  }

  return 'New message';
}

function createPushDeliveryService({
  messagingRepository,
  pushRegistrationRepository,
  pushSender,
  presenceRegistry = null,
} = {}) {
  if (
    !messagingRepository ||
    typeof messagingRepository
      .listConversationRecipientMemberIds !==
      'function'
  ) {
    throw new TypeError(
      'Messaging repository is required'
    );
  }

  if (
    !pushRegistrationRepository ||
    typeof pushRegistrationRepository
      .listActiveRegistrations !==
      'function'
  ) {
    throw new TypeError(
      'Push registration repository is required'
    );
  }

  if (
    !pushSender ||
    typeof pushSender.send !==
      'function'
  ) {
    throw new TypeError(
      'Push sender is required'
    );
  }

  function shouldPush({
    workspaceId,
    workspaceMemberId,
    conversationId,
  }) {
    if (
      !presenceRegistry ||
      typeof presenceRegistry
        .isActivelyReading !==
        'function'
    ) {
      return true;
    }

    return !presenceRegistry
      .isActivelyReading({
        workspaceId,
        workspaceMemberId,
        conversationId,
      });
  }

  async function publishMessage({
    workspaceId,
    conversationId,
    message,
    excludeWorkspaceMemberId = null,
  } = {}) {
    if (
      !workspaceId ||
      !conversationId ||
      !message?.message_id
    ) {
      return {
        attempted: 0,
      };
    }

    const memberIds =
      await messagingRepository
        .listConversationRecipientMemberIds({
          workspaceId,
          conversationId,
        });

    const recipients =
      (memberIds || [])
        .filter(
          (memberId) =>
            (
              !excludeWorkspaceMemberId ||
              memberId !==
                excludeWorkspaceMemberId
            ) &&
            shouldPush({
              workspaceId,
              workspaceMemberId:
                memberId,
              conversationId,
            })
        );

    if (recipients.length === 0) {
      return {
        attempted: 0,
        suppressed_active_readers: true,
      };
    }

    const registrations =
      await pushRegistrationRepository
        .listActiveRegistrations({
          workspaceId,
          workspaceMemberIds:
            recipients,
        });

    if (
      !registrations ||
      registrations.length === 0
    ) {
      return {
        attempted: 0,
      };
    }

    const conversation =
      await messagingRepository
        .getActiveConversation({
          workspaceId,
          conversationId,
        });

    const kind =
      conversation?.conversation_type ===
      'CHANNEL'
        ? 'channel'
        : 'dm';

    const sender =
      clean(
        message.sender_display_name
      ) ||
      (
        message.sender_type ===
        'SYSTEM'
          ? 'AkshaConnect'
          : 'New message'
      );

    const tokens =
      registrations.map(
        (row) =>
          row.push_token
      );

    const result =
      await pushSender.send({
        tokens,

        notification: {
          title: sender,
          body: preview(message),
        },

        data: {
          conversationId,
          kind,
          messageId:
            message.message_id,
        },
      });

    if (
      result.invalid_tokens?.length
    ) {
      await pushRegistrationRepository
        .revokeTokens({
          provider: 'FCM',
          tokens:
            result.invalid_tokens,
        });
    }

    return result;
  }

  return Object.freeze({
    publishMessage,
  });
}

module.exports = {
  createPushDeliveryService,
};
