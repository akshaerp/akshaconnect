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
  conversationPreferenceRepository = null,
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

  function isActivelyReading({
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
      return false;
    }

    return presenceRegistry
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

    let recipients =
      (memberIds || [])
        .filter(
          (memberId) =>
            (
              !excludeWorkspaceMemberId ||
              memberId !==
                excludeWorkspaceMemberId
            ) &&
            !isActivelyReading({
              workspaceId,
              workspaceMemberId:
                memberId,
              conversationId,
            })
        );

    if (
      recipients.length > 0 &&
      conversationPreferenceRepository &&
      typeof conversationPreferenceRepository
        .filterPushRecipients === 'function'
    ) {
      recipients =
        await conversationPreferenceRepository
          .filterPushRecipients({
            workspaceId,
            conversationId,
            workspaceMemberIds:
              recipients,
          });
    }

    if (recipients.length === 0) {
      return {
        attempted: 0,
        suppressed: true,
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

    const mentionedIds = new Set(
      (message.mentions || [])
        .filter((mention) => mention?.mention_type === 'MEMBER')
        .map((mention) => mention.target_workspace_member_id)
        .filter(Boolean)
    );

    const batches = [
      {
        rows: registrations.filter((row) => !mentionedIds.has(row.workspace_member_id)),
        title: sender,
        mentioned: 'false',
      },
      {
        rows: registrations.filter((row) => mentionedIds.has(row.workspace_member_id)),
        title: `${sender} mentioned you`,
        mentioned: 'true',
      },
    ].filter((batch) => batch.rows.length > 0);

    const results = [];
    for (const batch of batches) {
      results.push(await pushSender.send({
        tokens: batch.rows.map((row) => row.push_token),
        notification: {
          title: batch.title,
          body: preview(message),
        },
        data: {
          conversationId,
          kind,
          messageId: message.message_id,
          mentioned: batch.mentioned,
        },
      }));
    }

    const invalidTokens = results.flatMap((item) => item.invalid_tokens || []);
    if (invalidTokens.length) {
      await pushRegistrationRepository.revokeTokens({
        provider: 'FCM',
        tokens: invalidTokens,
      });
    }

    return {
      attempted: results.reduce((sum, item) => sum + Number(item.attempted || 0), 0),
      success_count: results.reduce((sum, item) => sum + Number(item.success_count || 0), 0),
      failure_count: results.reduce((sum, item) => sum + Number(item.failure_count || 0), 0),
      invalid_tokens: invalidTokens,
      mentioned: batches.find((batch) => batch.mentioned === 'true')?.rows.length || 0,
    };
  }

  return Object.freeze({
    publishMessage,
  });
}

module.exports = {
  createPushDeliveryService,
};
