'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  createMessagingService,
} = require(
  '../services/api/src/messaging/messagingService'
);

const ROOT = path.join(__dirname, '..');

const CLAIMS = Object.freeze({
  workspace_id: 'workspace-1',
  workspace_member_id: 'member-1',
  identity_id: 'identity-1',
});

const CONVERSATION_ID = 'conversation-1';

function read(relativePath) {
  return fs.readFileSync(
    path.join(ROOT, relativePath),
    'utf8'
  );
}

function harness({
  editResult,
  deleteResult,
  cleanupImpl = null,
} = {}) {
  const state = {
    realtime: [],
    push: [],
    cleanup: [],
  };

  const repository = {
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

    async updateHumanTextMessage(input) {
      state.editInput = input;

      return editResult || {
        status: 'UPDATED',
        message: {
          message_id: 'message-1',
          conversation_id:
            CONVERSATION_ID,
          sender_type: 'HUMAN',
          sender_member_id:
            CLAIMS.workspace_member_id,
          message_type: 'TEXT',
          body_text: input.bodyText,
          edited_at:
            '2026-09-19T07:30:00.000Z',
          deleted_at: null,
        },
      };
    },

    async softDeleteHumanMessage(input) {
      state.deleteInput = input;

      return deleteResult || {
        status: 'DELETED',
        message: {
          message_id: 'message-1',
          conversation_id:
            CONVERSATION_ID,
          sender_type: 'HUMAN',
          sender_member_id:
            CLAIMS.workspace_member_id,
          message_type: 'TEXT',
          body_text: 'before',
          edited_at: null,
          deleted_at:
            '2026-09-19T07:31:00.000Z',
        },
      };
    },
  };

  const service =
    createMessagingService(
      repository,
      {
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

        attachmentCleanup: {
          async purgeDeletedMessage(input) {
            state.cleanup.push(input);

            if (cleanupImpl) {
              return cleanupImpl(input);
            }

            return {
              purged: true,
            };
          },
        },
      }
    );

  return {
    service,
    state,
  };
}

test(
  'V4B5A edits only through trusted actor scope and publishes realtime without push',
  async () => {
    const { service, state } =
      harness();

    const result =
      await service.editHumanMessage(
        CLAIMS,
        CONVERSATION_ID,
        'message-1',
        {
          body_text: 'after',
        }
      );

    assert.equal(
      result.updated,
      true
    );

    assert.equal(
      state.editInput.workspaceId,
      CLAIMS.workspace_id
    );

    assert.equal(
      state.editInput.editorMemberId,
      CLAIMS.workspace_member_id
    );

    assert.equal(
      state.editInput.bodyText,
      'after'
    );

    assert.equal(
      state.realtime.length,
      1
    );

    assert.equal(
      state.realtime[0].type,
      'message.updated'
    );

    assert.equal(
      state.push.length,
      0
    );
  }
);

test(
  'V4B5A rejects edit of attachment and deleted messages',
  async () => {
    {
      const { service } =
        harness({
          editResult: {
            status: 'NOT_TEXT',
            message: {
              message_type:
                'ATTACHMENT',
            },
          },
        });

      await assert.rejects(
        () =>
          service.editHumanMessage(
            CLAIMS,
            CONVERSATION_ID,
            'message-1',
            {
              body_text: 'change',
            }
          ),
        (error) =>
          error.code ===
            'MESSAGE_EDIT_NOT_ALLOWED' &&
          error.statusCode === 409
      );
    }

    {
      const { service } =
        harness({
          editResult: {
            status: 'DELETED',
            message: {
              message_type: 'TEXT',
              deleted_at:
                '2026-09-19T07:00:00Z',
            },
          },
        });

      await assert.rejects(
        () =>
          service.editHumanMessage(
            CLAIMS,
            CONVERSATION_ID,
            'message-1',
            {
              body_text: 'change',
            }
          ),
        (error) =>
          error.code ===
            'MESSAGE_ALREADY_DELETED' &&
          error.statusCode === 409
      );
    }
  }
);

test(
  'V4B5A attachment delete revokes attachment metadata and publishes tombstone without push',
  async () => {
    const { service, state } =
      harness({
        deleteResult: {
          status: 'DELETED',
          message: {
            message_id: 'attachment-message-1',
            conversation_id:
              CONVERSATION_ID,
            sender_type: 'HUMAN',
            sender_member_id:
              CLAIMS.workspace_member_id,
            message_type:
              'ATTACHMENT',
            body_text:
              'document.pdf',
            deleted_at:
              '2026-09-19T07:31:00Z',
          },
        },
      });

    const result =
      await service.deleteHumanMessage(
        CLAIMS,
        CONVERSATION_ID,
        'attachment-message-1'
      );

    assert.equal(
      result.deleted,
      true
    );

    assert.deepEqual(
      result.message.attachments,
      []
    );

    assert.equal(
      state.cleanup.length,
      1
    );

    assert.equal(
      state.cleanup[0].messageId,
      'attachment-message-1'
    );

    assert.equal(
      state.realtime.length,
      1
    );

    assert.equal(
      state.realtime[0].type,
      'message.deleted'
    );

    assert.equal(
      state.push.length,
      0
    );
  }
);

test(
  'V4B5A repeated delete is idempotent and does not republish realtime',
  async () => {
    const { service, state } =
      harness({
        deleteResult: {
          status:
            'ALREADY_DELETED',
          message: {
            message_id: 'message-1',
            conversation_id:
              CONVERSATION_ID,
            sender_type: 'HUMAN',
            sender_member_id:
              CLAIMS.workspace_member_id,
            message_type: 'TEXT',
            deleted_at:
              '2026-09-19T07:31:00Z',
          },
        },
      });

    const result =
      await service.deleteHumanMessage(
        CLAIMS,
        CONVERSATION_ID,
        'message-1'
      );

    assert.equal(
      result.deleted,
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
  'V4B5A repository keeps encrypted revision history and soft-delete tombstones',
  () => {
    const source =
      read(
        'services/api/src/messaging/messagingRepository.js'
      );

    assert.match(
      source,
      /recordType:\s*'REVISION'/
    );

    assert.match(
      source,
      /INSERT INTO ac_message_revision/
    );

    assert.match(
      source,
      /body_ciphertext/
    );

    assert.match(
      source,
      /edited_at = NOW\(\)/
    );

    assert.match(
      source,
      /SET deleted_at = NOW\(\)/
    );
  }
);

test(
  'V4B5A deleted attachment cannot be decorated or downloaded and metadata can be detached',
  () => {
    const source =
      read(
        'services/api/src/attachments/attachmentRepository.js'
      );

    const deletedGuards =
      source.match(
        /m\.deleted_at IS NULL/g
      ) || [];

    assert.ok(
      deletedGuards.length >= 3
    );

    assert.match(
      source,
      /DELETE FROM ac_attachment/
    );

    assert.match(
      source,
      /detachAttachmentByMessageId/
    );
  }
);

test(
  'V4B5A HTTP and realtime boundaries expose edit/delete without FCM mutation fanout',
  () => {
    const app =
      read(
        'services/api/src/app.js'
      );

    const realtime =
      read(
        'services/api/src/realtime/realtimeGateway.js'
      );

    const service =
      read(
        'services/api/src/messaging/messagingService.js'
      );

    assert.match(
      app,
      /messageMutationRoute/
    );

    assert.match(
      app,
      /req\.method === 'PUT'/
    );

    assert.match(
      app,
      /req\.method === 'DELETE'/
    );

    assert.match(
      realtime,
      /message\.updated/
    );

    assert.match(
      realtime,
      /message\.deleted/
    );

    const editBlock =
      service.slice(
        service.indexOf(
          'async function editHumanMessage'
        ),
        service.indexOf(
          'async function getReadCursor'
        )
      );

    assert.doesNotMatch(
      editBlock,
      /publishPush\(/
    );
  }
);
