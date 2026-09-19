const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  createAttachmentService,
} = require(
  '../services/api/src/attachments/attachmentService'
);

const ROOT = process.cwd();

const CLAIMS = Object.freeze({
  workspace_id: 'ws-1',
  workspace_member_id: 'member-1',
  identity_id: 'identity-1',
});

const CONVERSATION_ID = 'conversation-1';

function attachmentInput(overrides = {}) {
  return {
    fileName: 'report.txt',
    contentType: 'text/plain',
    clientMessageId: 'client-attachment-1',
    data: Buffer.from('hello attachment'),
    ...overrides,
  };
}

function createHarness({
  existingMessage = null,
  existingAttachment = null,
  createMode = 'success',
  pushImpl = null,
} = {}) {
  const state = {
    message: existingMessage,
    attachment: existingAttachment,
    realtime: [],
    push: [],
    removedStorageKeys: [],
  };

  const messagingRepository = {
    async getActiveWorkspaceMember() {
      return {
        workspace_member_id:
          CLAIMS.workspace_member_id,
      };
    },

    async getConversationAccess() {
      return {
        conversation_id:
          CONVERSATION_ID,
      };
    },

    async findHumanMessageByClientId() {
      return state.message;
    },
  };

  const attachmentRepository = {
    async listAttachmentsForMessages() {
      return [];
    },

    async findAttachmentByMessageId() {
      return state.attachment;
    },

    async createAttachmentMessage(input) {
      if (createMode === 'unique-race') {
        const error = new Error('duplicate');
        error.code = '23505';
        error.constraint =
          'uq_ac_message_client_id';
        throw error;
      }

      state.message = {
        message_id: input.messageId,
        conversation_id:
          input.conversationId,
        sender_type: 'HUMAN',
        sender_member_id:
          input.senderMemberId,
        message_type: 'ATTACHMENT',
        body_text: input.fileName,
        client_message_id:
          input.clientMessageId,
      };

      state.attachment = {
        attachment_id:
          input.attachmentId,
        message_id:
          input.messageId,
        file_name:
          input.fileName,
        content_type:
          input.contentType,
        size_bytes:
          input.sizeBytes,
        sha256_hex:
          input.sha256Hex,
      };
    },
  };

  const storage = {
    configured: true,
    providerCode: 'LOCAL',

    async put() {},

    async remove(storageKey) {
      state.removedStorageKeys.push(
        storageKey
      );
    },
  };

  const attachmentCrypto = {
    encryptBuffer() {
      return {
        ciphertext:
          Buffer.from('encrypted'),
        content_nonce: 'nonce',
        content_auth_tag: 'tag',
        encryption_key_id: 'key-1',
        encryption_version: 1,
      };
    },

    decryptBuffer() {
      throw new Error(
        'not needed by V4B4 tests'
      );
    },
  };

  const eventPublisher = {
    publish(event) {
      state.realtime.push(event);
    },
  };

  const pushPublisher = {
    publishMessage(event) {
      state.push.push(event);

      if (pushImpl) {
        return pushImpl(event);
      }

      return Promise.resolve({
        attempted: 1,
      });
    },
  };

  const service = createAttachmentService({
    messagingRepository,
    attachmentRepository,
    attachmentCrypto,
    storage,
    eventPublisher,
    pushPublisher,
  });

  return {
    service,
    state,
  };
}

function existingPair() {
  const data = Buffer.from(
    'hello attachment'
  );
  const sha256Hex = require('node:crypto')
    .createHash('sha256')
    .update(data)
    .digest('hex');

  const message = {
    message_id: 'existing-message-1',
    conversation_id:
      CONVERSATION_ID,
    sender_type: 'HUMAN',
    sender_member_id:
      CLAIMS.workspace_member_id,
    message_type: 'ATTACHMENT',
    body_text: 'report.txt',
    client_message_id:
      'client-attachment-1',
  };

  const attachment = {
    attachment_id:
      'existing-attachment-1',
    message_id:
      message.message_id,
    file_name: 'report.txt',
    content_type: 'text/plain',
    size_bytes: data.length,
    sha256_hex: sha256Hex,
  };

  return {
    message,
    attachment,
  };
}

test(
  'V4B4 new durable attachment publishes one push and excludes sender',
  async () => {
    const { service, state } =
      createHarness();

    const result =
      await service.uploadHumanAttachment(
        CLAIMS,
        CONVERSATION_ID,
        attachmentInput()
      );

    assert.equal(
      result.created,
      true
    );

    assert.equal(
      state.realtime.length,
      1
    );

    assert.equal(
      state.push.length,
      1
    );

    assert.equal(
      state.push[0].workspaceId,
      CLAIMS.workspace_id
    );

    assert.equal(
      state.push[0].conversationId,
      CONVERSATION_ID
    );

    assert.equal(
      state.push[0]
        .excludeWorkspaceMemberId,
      CLAIMS.workspace_member_id
    );

    assert.equal(
      state.push[0].message.message_type,
      'ATTACHMENT'
    );

    assert.equal(
      state.push[0]
        .message.attachments.length,
      1
    );
  }
);

test(
  'V4B4 idempotent attachment replay does not publish duplicate realtime or push',
  async () => {
    const pair = existingPair();

    const { service, state } =
      createHarness({
        existingMessage:
          pair.message,
        existingAttachment:
          pair.attachment,
      });

    const result =
      await service.uploadHumanAttachment(
        CLAIMS,
        CONVERSATION_ID,
        attachmentInput()
      );

    assert.equal(
      result.created,
      false
    );

    assert.equal(
      state.realtime.length,
      0
    );

    assert.equal(
      state.push.length,
      0
    );
  }
);

test(
  'V4B4 concurrent duplicate attachment winner does not publish duplicate push',
  async () => {
    const pair = existingPair();

    const { service, state } =
      createHarness({
        existingMessage: null,
        existingAttachment: null,
        createMode: 'unique-race',
      });

    let findCalls = 0;

    const original =
      service;

    // Recreate with a repository whose first client-id lookup misses,
    // then resolves the committed concurrent winner.
    const messagingRepository = {
      async getActiveWorkspaceMember() {
        return {};
      },

      async getConversationAccess() {
        return {};
      },

      async findHumanMessageByClientId() {
        findCalls += 1;
        return findCalls === 1
          ? null
          : pair.message;
      },
    };

    const attachmentRepository = {
      async listAttachmentsForMessages() {
        return [];
      },

      async findAttachmentByMessageId() {
        return pair.attachment;
      },

      async createAttachmentMessage() {
        const error =
          new Error('duplicate');
        error.code = '23505';
        error.constraint =
          'uq_ac_message_client_id';
        throw error;
      },
    };

    const serviceForRace =
      createAttachmentService({
        messagingRepository,
        attachmentRepository,
        attachmentCrypto: {
          encryptBuffer() {
            return {
              ciphertext:
                Buffer.from('encrypted'),
            };
          },
        },
        storage: {
          configured: true,
          providerCode: 'LOCAL',
          async put() {},
          async remove(storageKey) {
            state.removedStorageKeys
              .push(storageKey);
          },
        },
        eventPublisher: {
          publish(event) {
            state.realtime.push(event);
          },
        },
        pushPublisher: {
          publishMessage(event) {
            state.push.push(event);
            return Promise.resolve();
          },
        },
      });

    assert.ok(original);

    const result =
      await serviceForRace
        .uploadHumanAttachment(
          CLAIMS,
          CONVERSATION_ID,
          attachmentInput()
        );

    assert.equal(
      result.created,
      false
    );

    assert.equal(
      state.realtime.length,
      0
    );

    assert.equal(
      state.push.length,
      0
    );

    assert.equal(
      state.removedStorageKeys.length,
      1
    );
  }
);

test(
  'V4B4 push failure remains best effort after durable attachment creation',
  async () => {
    const { service, state } =
      createHarness({
        pushImpl() {
          return Promise.reject(
            new Error('push unavailable')
          );
        },
      });

    const result =
      await service.uploadHumanAttachment(
        CLAIMS,
        CONVERSATION_ID,
        attachmentInput({
          clientMessageId:
            'client-attachment-push-failure',
        })
      );

    await new Promise((resolve) =>
      setImmediate(resolve)
    );

    assert.equal(
      result.created,
      true
    );

    assert.equal(
      state.push.length,
      1
    );
  }
);

test(
  'V4B4 server wires attachment service to the existing push delivery service',
  () => {
    const server = fs.readFileSync(
      path.join(
        ROOT,
        'services/api/src/server.js'
      ),
      'utf8'
    );

    assert.match(
      server,
      /createAttachmentService\(\{[\s\S]*pushPublisher:\s*pushDeliveryService/
    );
  }
);
