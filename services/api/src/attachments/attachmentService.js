
'use strict';

const {
  createHash,
  randomUUID,
} = require('node:crypto');
const { boundaryError } = require('../core/boundaryError');

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_FILE_NAME_CHARS = 255;
const MAX_CLIENT_MESSAGE_ID_CHARS = 120;

const ALLOWED_CONTENT_TYPES = Object.freeze(new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]));

function clean(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function requireActorClaims(claims = {}) {
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
  return { workspaceId, workspaceMemberId, identityId };
}

function normalizeContentType(value) {
  return clean(value).split(';')[0].trim().toLowerCase();
}

function validateFileName(value) {
  const fileName = clean(value);
  if (
    !fileName ||
    fileName.length > MAX_FILE_NAME_CHARS ||
    /[\/\\\u0000-\u001f\u007f]/.test(fileName) ||
    fileName === '.' ||
    fileName === '..'
  ) {
    throw boundaryError(
      'ATTACHMENT_FILE_NAME_INVALID',
      'Attachment file name is invalid',
      400
    );
  }
  return fileName;
}

function validateContentType(value) {
  const contentType = normalizeContentType(value);
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw boundaryError(
      'ATTACHMENT_TYPE_NOT_ALLOWED',
      'This attachment type is not allowed',
      415
    );
  }
  return contentType;
}

function validateClientMessageId(value) {
  const id = clean(value);
  if (!id || id.length > MAX_CLIENT_MESSAGE_ID_CHARS) {
    throw boundaryError(
      'CLIENT_MESSAGE_ID_INVALID',
      `client_message_id must contain 1 to ${MAX_CLIENT_MESSAGE_ID_CHARS} characters`,
      400
    );
  }
  return id;
}

function verifyBasicSignature(buffer, contentType) {
  const data = Buffer.from(buffer || []);
  if (contentType === 'application/pdf') {
    return data.length >= 5 && data.subarray(0, 5).toString('ascii') === '%PDF-';
  }
  if (contentType === 'image/png') {
    return data.length >= 8
      && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  if (contentType === 'image/jpeg') {
    return data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  }
  if (contentType === 'image/webp') {
    return data.length >= 12
      && data.subarray(0, 4).toString('ascii') === 'RIFF'
      && data.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  if (contentType.startsWith('application/vnd.openxmlformats-officedocument.')) {
    return data.length >= 4
      && data[0] === 0x50
      && data[1] === 0x4b
      && data[2] === 0x03
      && data[3] === 0x04;
  }
  if (contentType === 'text/plain' || contentType === 'text/csv') {
    return !data.includes(0);
  }
  return true;
}

function sameAttachment(existingMessage, existingAttachment, expected) {
  return Boolean(
    existingMessage &&
    existingAttachment &&
    existingMessage.sender_type === 'HUMAN' &&
    existingMessage.sender_member_id === expected.senderMemberId &&
    existingMessage.message_type === 'ATTACHMENT' &&
    existingMessage.body_text === expected.fileName &&
    existingAttachment.content_type === expected.contentType &&
    Number(existingAttachment.size_bytes) === expected.sizeBytes &&
    existingAttachment.sha256_hex === expected.sha256Hex
  );
}

function createAttachmentService({
  messagingRepository,
  attachmentRepository,
  attachmentCrypto,
  storage = null,
  eventPublisher = null,
} = {}) {
  if (!messagingRepository) throw new TypeError('Messaging repository is required');
  if (!attachmentRepository) throw new TypeError('Attachment repository is required');
  if (!attachmentCrypto) throw new TypeError('Attachment crypto is required');

  function publishRealtime(event) {
    try {
      eventPublisher?.publish?.(Object.freeze(event));
    } catch {
      // PostgreSQL + encrypted object storage remain authoritative.
    }
  }

  async function requireActiveActorAndConversation(claims, conversationId) {
    const actor = requireActorClaims(claims);
    const member = await messagingRepository.getActiveWorkspaceMember({
      workspaceId: actor.workspaceId,
      workspaceMemberId: actor.workspaceMemberId,
    });
    if (!member) {
      throw boundaryError('WORKSPACE_ACCESS_DENIED', 'Workspace access denied', 403);
    }

    const cleanConversationId = clean(conversationId);
    if (!cleanConversationId) {
      throw boundaryError('CONVERSATION_ID_REQUIRED', 'Conversation id is required', 400);
    }

    const access = await messagingRepository.getConversationAccess({
      workspaceId: actor.workspaceId,
      workspaceMemberId: actor.workspaceMemberId,
      conversationId: cleanConversationId,
    });
    if (!access) {
      throw boundaryError(
        'CONVERSATION_ACCESS_DENIED',
        'Conversation is unavailable',
        404
      );
    }

    return {
      actor,
      conversationId: cleanConversationId,
    };
  }

  async function decorateMessages(claims, conversationId, messages = []) {
    const { actor, conversationId: allowedConversationId } =
      await requireActiveActorAndConversation(claims, conversationId);

    const messageIds = (messages || [])
      .map((message) => message?.message_id)
      .filter(Boolean);

    const attachments = await attachmentRepository.listAttachmentsForMessages({
      workspaceId: actor.workspaceId,
      conversationId: allowedConversationId,
      messageIds,
    });

    const grouped = new Map();
    for (const attachment of attachments) {
      const list = grouped.get(attachment.message_id) || [];
      list.push(attachment);
      grouped.set(attachment.message_id, list);
    }

    return (messages || []).map((message) => ({
      ...message,
      attachments: grouped.get(message.message_id) || [],
    }));
  }

  async function uploadHumanAttachment(claims, conversationId, input = {}) {
    const { actor, conversationId: allowedConversationId } =
      await requireActiveActorAndConversation(claims, conversationId);

    if (!storage?.configured) {
      throw boundaryError(
        'ATTACHMENT_STORAGE_NOT_CONFIGURED',
        'Attachment storage is not configured',
        503
      );
    }

    const fileName = validateFileName(input.fileName);
    const contentType = validateContentType(input.contentType);
    const clientMessageId = validateClientMessageId(input.clientMessageId);
    const data = Buffer.from(input.data || []);

    if (!data.length || data.length > MAX_ATTACHMENT_BYTES) {
      throw boundaryError(
        'ATTACHMENT_SIZE_INVALID',
        `Attachment must contain 1 to ${MAX_ATTACHMENT_BYTES} bytes`,
        413
      );
    }

    if (!verifyBasicSignature(data, contentType)) {
      throw boundaryError(
        'ATTACHMENT_CONTENT_MISMATCH',
        'Attachment content does not match the declared file type',
        415
      );
    }

    const sha256Hex = createHash('sha256').update(data).digest('hex');
    const expected = {
      senderMemberId: actor.workspaceMemberId,
      fileName,
      contentType,
      sizeBytes: data.length,
      sha256Hex,
    };

    const existingMessage = await messagingRepository.findHumanMessageByClientId({
      workspaceId: actor.workspaceId,
      conversationId: allowedConversationId,
      clientMessageId,
    });

    if (existingMessage) {
      const existingAttachment = await attachmentRepository.findAttachmentByMessageId({
        workspaceId: actor.workspaceId,
        conversationId: allowedConversationId,
        messageId: existingMessage.message_id,
      });

      if (!sameAttachment(existingMessage, existingAttachment, expected)) {
        throw boundaryError(
          'MESSAGE_IDEMPOTENCY_CONFLICT',
          'client_message_id is already bound to different attachment content',
          409
        );
      }

      return {
        created: false,
        message: {
          ...existingMessage,
          attachments: [existingAttachment],
        },
      };
    }

    const messageId = randomUUID();
    const attachmentId = randomUUID();
    const storageKey = `${attachmentId}.bin`;
    const encryption = attachmentCrypto.encryptBuffer(data, {
      workspaceId: actor.workspaceId,
      conversationId: allowedConversationId,
      attachmentId,
    });

    await storage.put(storageKey, encryption.ciphertext);

    try {
      await attachmentRepository.createAttachmentMessage({
        workspaceId: actor.workspaceId,
        conversationId: allowedConversationId,
        senderMemberId: actor.workspaceMemberId,
        clientMessageId,
        fileName,
        contentType,
        sizeBytes: data.length,
        sha256Hex,
        storageProvider: storage.providerCode,
        storageKey,
        encryption,
        messageId,
        attachmentId,
      });
    } catch (error) {
      await storage.remove(storageKey).catch(() => {});

      if (error?.code === '23505' && error?.constraint === 'uq_ac_message_client_id') {
        const winner = await messagingRepository.findHumanMessageByClientId({
          workspaceId: actor.workspaceId,
          conversationId: allowedConversationId,
          clientMessageId,
        });
        const winnerAttachment = winner
          ? await attachmentRepository.findAttachmentByMessageId({
              workspaceId: actor.workspaceId,
              conversationId: allowedConversationId,
              messageId: winner.message_id,
            })
          : null;

        if (sameAttachment(winner, winnerAttachment, expected)) {
          return {
            created: false,
            message: {
              ...winner,
              attachments: [winnerAttachment],
            },
          };
        }

        throw boundaryError(
          'MESSAGE_IDEMPOTENCY_CONFLICT',
          'client_message_id is already bound to different attachment content',
          409
        );
      }
      throw error;
    }

    const message = await messagingRepository.findHumanMessageByClientId({
      workspaceId: actor.workspaceId,
      conversationId: allowedConversationId,
      clientMessageId,
    });
    const attachment = await attachmentRepository.findAttachmentByMessageId({
      workspaceId: actor.workspaceId,
      conversationId: allowedConversationId,
      messageId: message.message_id,
    });

    const decorated = {
      ...message,
      attachments: [attachment],
    };

    publishRealtime({
      type: 'message.created',
      workspace_id: actor.workspaceId,
      conversation_id: allowedConversationId,
      message: decorated,
    });

    return {
      created: true,
      message: decorated,
    };
  }

  async function downloadAttachment(claims, conversationId, attachmentId) {
    const { actor, conversationId: allowedConversationId } =
      await requireActiveActorAndConversation(claims, conversationId);

    if (!storage?.configured) {
      throw boundaryError(
        'ATTACHMENT_STORAGE_NOT_CONFIGURED',
        'Attachment storage is not configured',
        503
      );
    }

    const cleanAttachmentId = clean(attachmentId);
    if (!cleanAttachmentId) {
      throw boundaryError(
        'ATTACHMENT_ID_REQUIRED',
        'Attachment id is required',
        400
      );
    }

    const attachment = await attachmentRepository.getAttachmentForDownload({
      workspaceId: actor.workspaceId,
      conversationId: allowedConversationId,
      attachmentId: cleanAttachmentId,
    });

    if (!attachment) {
      throw boundaryError(
        'ATTACHMENT_NOT_FOUND',
        'Attachment is unavailable',
        404
      );
    }

    if (attachment.storage_provider !== storage.providerCode) {
      throw boundaryError(
        'ATTACHMENT_STORAGE_UNAVAILABLE',
        'Attachment storage provider is unavailable',
        503
      );
    }

    const ciphertext = await storage.get(attachment.storage_key);
    const plaintext = attachmentCrypto.decryptBuffer({
      ciphertext,
      content_nonce: attachment.content_nonce,
      content_auth_tag: attachment.content_auth_tag,
      encryption_key_id: attachment.encryption_key_id,
      encryption_version: attachment.encryption_version,
    }, {
      workspaceId: actor.workspaceId,
      conversationId: allowedConversationId,
      attachmentId: attachment.attachment_id,
    });

    const hash = createHash('sha256').update(plaintext).digest('hex');
    if (
      plaintext.length !== Number(attachment.size_bytes) ||
      hash !== attachment.sha256_hex
    ) {
      throw boundaryError(
        'ATTACHMENT_INTEGRITY_FAILED',
        'Attachment integrity verification failed',
        500
      );
    }

    return {
      fileName: attachment.file_name,
      contentType: attachment.content_type,
      data: plaintext,
    };
  }

  return Object.freeze({
    maxAttachmentBytes: MAX_ATTACHMENT_BYTES,
    decorateMessages,
    uploadHumanAttachment,
    downloadAttachment,
  });
}

module.exports = {
  MAX_ATTACHMENT_BYTES,
  MAX_FILE_NAME_CHARS,
  ALLOWED_CONTENT_TYPES,
  normalizeContentType,
  validateFileName,
  validateContentType,
  verifyBasicSignature,
  createAttachmentService,
};
