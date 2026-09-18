'use strict';

const assert =
  require('node:assert/strict');

const fs =
  require('node:fs');

const test =
  require('node:test');

const {
  createPushRegistrationService,
} =
  require('../services/api/src/push/pushRegistrationService');


test(
  'V3D1A mobile intercepts Android back only while a conversation is open',
  () => {
    const source =
      fs.readFileSync(
        'apps/mobile/App.jsx',
        'utf8'
      );

    assert.match(
      source,
      /\bBackHandler\b/
    );

    assert.match(
      source,
      /BackHandler\.addEventListener\(\s*'hardwareBackPress'/
    );

    assert.match(
      source,
      /if \(!selectedConversation\)[\s\S]*return undefined/
    );

    assert.match(
      source,
      /setSelectedConversation\(null\)[\s\S]*return true/
    );
  }
);


test(
  'V3D1A push registration requires the access identity to match the mobile device session',
  async () => {
    let captured = null;

    const service =
      createPushRegistrationService({
        identityRepository: {
          async findActiveDeviceSession() {
            return {
              device_session_id:
                '11111111-1111-1111-1111-111111111111',
              workspace_id:
                '22222222-2222-2222-2222-222222222222',
              workspace_member_id:
                '33333333-3333-3333-3333-333333333333',
              identity_id:
                '44444444-4444-4444-4444-444444444444',
              device_platform:
                'ANDROID',
            };
          },
        },

        pushRegistrationRepository: {
          async upsertRegistration(input) {
            captured = input;

            return {
              push_registration_id:
                '55555555-5555-5555-5555-555555555555',
              last_seen_at:
                '2026-09-18T09:00:00.000Z',
            };
          },

          async revokeRegistration() {
            return 1;
          },
        },
      });

    const result =
      await service.register(
        {
          workspace_id:
            '22222222-2222-2222-2222-222222222222',
          workspace_member_id:
            '33333333-3333-3333-3333-333333333333',
          identity_id:
            '44444444-4444-4444-4444-444444444444',
        },
        {
          device_token:
            'device-session-proof-not-stored-as-fcm',
          provider: 'FCM',
          platform: 'ANDROID',
          push_token:
            'fcm-registration-token-abcdefghijklmnopqrstuvwxyz',
        }
      );

    assert.equal(
      result.registered,
      true
    );

    assert.equal(
      captured.deviceSessionId,
      '11111111-1111-1111-1111-111111111111'
    );

    assert.equal(
      captured.provider,
      'FCM'
    );

    assert.equal(
      captured.platform,
      'ANDROID'
    );
  }
);


test(
  'V3D1A rejects an FCM registration for another authenticated member',
  async () => {
    const service =
      createPushRegistrationService({
        identityRepository: {
          async findActiveDeviceSession() {
            return {
              device_session_id:
                '11111111-1111-1111-1111-111111111111',
              workspace_id:
                '22222222-2222-2222-2222-222222222222',
              workspace_member_id:
                '33333333-3333-3333-3333-333333333333',
              identity_id:
                '44444444-4444-4444-4444-444444444444',
              device_platform:
                'ANDROID',
            };
          },
        },

        pushRegistrationRepository: {
          async upsertRegistration() {
            throw new Error(
              'must not be reached'
            );
          },

          async revokeRegistration() {
            return 0;
          },
        },
      });

    await assert.rejects(
      () =>
        service.register(
          {
            workspace_id:
              '22222222-2222-2222-2222-222222222222',
            workspace_member_id:
              '99999999-9999-9999-9999-999999999999',
            identity_id:
              '44444444-4444-4444-4444-444444444444',
          },
          {
            device_token:
              'device-session-proof-not-stored-as-fcm',
            provider: 'FCM',
            platform: 'ANDROID',
            push_token:
              'fcm-registration-token-abcdefghijklmnopqrstuvwxyz',
          }
        ),
      (error) =>
        error?.code ===
        'MOBILE_DEVICE_SESSION_INVALID'
    );
  }
);


test(
  'V3D1A exposes authenticated push register and unregister routes',
  () => {
    const source =
      fs.readFileSync(
        'services/api/src/app.js',
        'utf8'
      );

    assert.match(
      source,
      /\/api\/v1\/mobile\/push\/register/
    );

    assert.match(
      source,
      /\/api\/v1\/mobile\/push\/unregister/
    );

    assert.match(
      source,
      /verifyAccessToken/
    );

    assert.match(
      source,
      /pushRegistrationService\.register/
    );

    assert.match(
      source,
      /pushRegistrationService\.unregister/
    );
  }
);


test(
  'V3D1A migration binds push registrations to device sessions',
  () => {
    const source =
      fs.readFileSync(
        'database/migrations/202609181430__p1_v8a_v3d1_push_registration.sql',
        'utf8'
      );

    assert.match(
      source,
      /REFERENCES ac_device_session/
    );

    assert.match(
      source,
      /ON DELETE CASCADE/
    );

    assert.match(
      source,
      /UNIQUE\s*\(\s*provider,\s*push_token\s*\)/s
    );

    assert.match(
      source,
      /provider IN \('FCM'\)/
    );
  }
);