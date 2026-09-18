'use strict';

const assert =
  require('node:assert/strict');

const fs =
  require('node:fs');

const test =
  require('node:test');

const {
  createPushDeliveryService,
} =
  require('../services/api/src/push/pushDeliveryService');


test(
  'V3D1B excludes the human sender from push recipients',
  async () => {
    let requestedMembers = null;
    let sentTokens = null;

    const service =
      createPushDeliveryService({
        messagingRepository: {
          async listConversationRecipientMemberIds() {
            return [
              'sender',
              'recipient',
            ];
          },

          async getActiveConversation() {
            return {
              conversation_type: 'DM',
            };
          },
        },

        pushRegistrationRepository: {
          async listActiveRegistrations({
            workspaceMemberIds,
          }) {
            requestedMembers =
              workspaceMemberIds;

            return [
              {
                push_token:
                  'recipient-fcm-token',
              },
            ];
          },

          async revokeTokens() {
            return 0;
          },
        },

        pushSender: {
          async send({ tokens }) {
            sentTokens = tokens;

            return {
              attempted: 1,
              success_count: 1,
              failure_count: 0,
              invalid_tokens: [],
            };
          },
        },
      });

    await service.publishMessage({
      workspaceId: 'workspace',
      conversationId: 'conversation',
      excludeWorkspaceMemberId:
        'sender',

      message: {
        message_id: 'message',
        sender_type: 'HUMAN',
        sender_display_name: 'Bob',
        body_text: 'Hello',
      },
    });

    assert.deepEqual(
      requestedMembers,
      ['recipient']
    );

    assert.deepEqual(
      sentTokens,
      ['recipient-fcm-token']
    );
  }
);


test(
  'V3D1B revokes invalid FCM tokens',
  async () => {
    let revoked = null;

    const service =
      createPushDeliveryService({
        messagingRepository: {
          async listConversationRecipientMemberIds() {
            return ['recipient'];
          },

          async getActiveConversation() {
            return {
              conversation_type:
                'CHANNEL',
            };
          },
        },

        pushRegistrationRepository: {
          async listActiveRegistrations() {
            return [
              {
                push_token:
                  'bad-fcm-token',
              },
            ];
          },

          async revokeTokens(input) {
            revoked = input;
            return 1;
          },
        },

        pushSender: {
          async send() {
            return {
              attempted: 1,
              success_count: 0,
              failure_count: 1,
              invalid_tokens: [
                'bad-fcm-token',
              ],
            };
          },
        },
      });

    await service.publishMessage({
      workspaceId: 'workspace',
      conversationId: 'conversation',

      message: {
        message_id: 'message',
        sender_type: 'SYSTEM',
        body_text: 'Update',
      },
    });

    assert.deepEqual(
      revoked,
      {
        provider: 'FCM',
        tokens: [
          'bad-fcm-token',
        ],
      }
    );
  }
);


test(
  'V3D1B messaging service contains best-effort push fanout',
  () => {
    const source =
      fs.readFileSync(
        'services/api/src/messaging/messagingService.js',
        'utf8'
      );

    assert.match(
      source,
      /pushPublisher/
    );

    assert.match(
      source,
      /publishPush/
    );

    assert.match(
      source,
      /excludeWorkspaceMemberId/
    );
  }
);


test(
  'V3D1B active registration query rejects revoked or expired device sessions',
  () => {
    const source =
      fs.readFileSync(
        'services/api/src/push/pushRegistrationRepository.js',
        'utf8'
      );

    assert.match(
      source,
      /d\.revoked_at IS NULL/
    );

    assert.match(
      source,
      /d\.expires_at > NOW\(\)/
    );

    assert.match(
      source,
      /password_changed_at/
    );
  }
);