'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createLocalIdentityService,
  DEFAULT_DEVICE_SESSION_TTL_SECONDS,
} = require(
  '../services/api/src/auth/localIdentityService'
);

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(
    path.join(root, relativePath),
    'utf8'
  );
}


test('V3C2 device-session migration stores only device-token hash', () => {
  const sql = read(
    'database/migrations/202609181100__p1_v8a_v3c2_mobile_device_session.sql'
  );

  assert.match(
    sql,
    /CREATE TABLE ac_device_session/
  );

  assert.match(
    sql,
    /device_token_hash CHAR\(64\) NOT NULL/
  );

  assert.doesNotMatch(
    sql,
    /\bdevice_token\s+(?:TEXT|VARCHAR|CHAR)/i
  );

  assert.match(
    sql,
    /FOREIGN KEY \([\s\S]*workspace_id,[\s\S]*workspace_member_id,[\s\S]*identity_id/
  );
});


test('V3C2 mobile login issues hashed revocable device credential', async () => {
  let capturedDevice = null;

  const repository = {
    async findLocalLogin() {
      return {
        identity_id: 'identity-1',
        display_name: 'Bob',
        primary_email: null,
        identity_status: 'ACTIVE',

        workspace_id: 'workspace-1',
        workspace_code: 'DEV_ALPHA',
        workspace_name: 'Dev Alpha',
        workspace_status: 'ACTIVE',

        workspace_member_id: 'member-1',
        member_role: 'MEMBER',
        member_status: 'ACTIVE',

        credential_status: 'ACTIVE',
        locked_until: null,
        password_matches: true,
      };
    },

    async resetFailedLogin() {},

    async createSession(input) {
      return {
        session_id: 'session-1',
        expires_at: input.expiresAt,
      };
    },

    async createDeviceSession(input) {
      capturedDevice = input;

      return {
        device_session_id: 'device-1',
        expires_at: input.expiresAt,
      };
    },

    async revokeSession() {},
  };

  const service =
    createLocalIdentityService(repository);

  const result =
    await service.loginMobile({
      workspace_code: 'DEV_ALPHA',
      login_name: 'dev-bob',
      password: 'not-persisted',
      device_platform: 'ANDROID',
      device_label: 'Test Android',
    });

  assert.equal(
    typeof result.device_token,
    'string'
  );

  assert.ok(
    result.device_token.length >= 32
  );

  assert.match(
    capturedDevice.tokenHash,
    /^[a-f0-9]{64}$/
  );

  assert.notEqual(
    capturedDevice.tokenHash,
    result.device_token
  );

  assert.equal(
    capturedDevice.devicePlatform,
    'ANDROID'
  );

  assert.equal(
    DEFAULT_DEVICE_SESSION_TTL_SECONDS,
    365 * 24 * 60 * 60
  );
});


test('V3C2 device refresh issues a fresh normal access session', async () => {
  let createdSession = null;
  let touched = null;

  const repository = {
    async findActiveDeviceSession() {
      return {
        device_session_id: 'device-1',

        identity_id: 'identity-1',
        display_name: 'Bob',
        primary_email: null,
        identity_status: 'ACTIVE',

        workspace_id: 'workspace-1',
        workspace_code: 'DEV_ALPHA',
        workspace_name: 'Dev Alpha',
        workspace_status: 'ACTIVE',

        workspace_member_id: 'member-1',
        member_role: 'MEMBER',
        member_status: 'ACTIVE',

        credential_status: 'ACTIVE',
      };
    },

    async touchDeviceSession(input) {
      touched = input;

      return {
        expires_at: input.expiresAt,
      };
    },

    async createSession(input) {
      createdSession = input;

      return {
        session_id: 'fresh-session',
        expires_at: input.expiresAt,
      };
    },
  };

  const service =
    createLocalIdentityService(repository);

  const result =
    await service.refreshMobile({
      device_token: 'device-secret',
    });

  assert.equal(
    result.session_id,
    'fresh-session'
  );

  assert.equal(
    result.workspace.workspace_code,
    'DEV_ALPHA'
  );

  assert.match(
    createdSession.tokenHash,
    /^[a-f0-9]{64}$/
  );

  assert.equal(
    touched.deviceSessionId,
    'device-1'
  );
});


test('V3C2 mobile logout revokes only the supplied device credential', async () => {
  let revokedHash = null;

  const repository = {
    async revokeDeviceSession(hash) {
      revokedHash = hash;
      return true;
    },
  };

  const service =
    createLocalIdentityService(repository);

  const result =
    await service.logoutMobile({
      device_token: 'device-secret',
    });

  assert.equal(result.success, true);

  assert.match(
    revokedHash,
    /^[a-f0-9]{64}$/
  );
});


test('V3C2 exposes dedicated mobile login refresh and logout routes', () => {
  const app = read(
    'services/api/src/app.js'
  );

  assert.match(
    app,
    /\/api\/v1\/auth\/mobile\/login/
  );

  assert.match(
    app,
    /\/api\/v1\/auth\/mobile\/refresh/
  );

  assert.match(
    app,
    /\/api\/v1\/auth\/mobile\/logout/
  );

  assert.match(
    app,
    /loginMobile/
  );

  assert.match(
    app,
    /refreshMobile/
  );

  assert.match(
    app,
    /logoutMobile/
  );
});


test('V3C2 password change invalidates older device sessions structurally', () => {
  const repository = read(
    'services/api/src/auth/localIdentityRepository.js'
  );

  assert.match(
    repository,
    /password_changed_at IS NULL[\s\S]*d\.created_at > c\.password_changed_at/
  );
});
