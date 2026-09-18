'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  createLocalIdentityService,
} = require('../services/api/src/auth/localIdentityService');
const {
  createRequestHandler,
} = require('../services/api/src/app');

function activeSession() {
  return {
    session_id: '11111111-1111-4111-8111-111111111111',
    identity_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    workspace_id: '22222222-2222-4222-8222-222222222222',
    workspace_member_id: '33333333-3333-4333-8333-333333333333',
    expires_at: new Date(Date.now() + 60000).toISOString(),
    display_name: 'Alice Alpha',
    primary_email: 'alice@example.invalid',
    identity_status: 'ACTIVE',
    workspace_code: 'DEV_ALPHA',
    workspace_name: 'AkshaConnect Dev Alpha',
    workspace_status: 'ACTIVE',
    member_role: 'OWNER',
    member_status: 'ACTIVE',
  };
}

function passwordRepository(overrides = {}) {
  const calls = {
    changePassword: null,
    touched: 0,
  };

  return {
    calls,
    repo: {
      async findActiveSession() {
        return activeSession();
      },
      async touchSession() {
        calls.touched += 1;
      },
      async changePassword(input) {
        calls.changePassword = input;
        return {
          identity_id: input.identityId,
          password_changed_at: new Date().toISOString(),
          revoked_session_count: 2,
        };
      },
      ...overrides,
    },
  };
}

test('change password authenticates session and preserves its session id', async () => {
  const { repo, calls } = passwordRepository();
  const service = createLocalIdentityService(repo);

  const result = await service.changePassword('opaque-token', {
    current_password: 'CurrentPass123!',
    new_password: 'NewPassword123!',
  });

  assert.equal(result.success, true);
  assert.equal(result.revoked_session_count, 2);
  assert.equal(calls.touched, 1);
  assert.equal(
    calls.changePassword.currentSessionId,
    '11111111-1111-4111-8111-111111111111'
  );
  assert.equal(
    calls.changePassword.identityId,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  );
});

test('weak replacement password fails before credential update', async () => {
  const { repo, calls } = passwordRepository();
  const service = createLocalIdentityService(repo);

  await assert.rejects(
    () => service.changePassword('opaque-token', {
      current_password: 'CurrentPass123!',
      new_password: 'short',
    }),
    (error) => (
      error.code === 'LOCAL_PASSWORD_WEAK'
      && error.statusCode === 400
    )
  );

  assert.equal(calls.changePassword, null);
});

test('incorrect current password is rejected without exposing credential data', async () => {
  const { repo } = passwordRepository({
    async changePassword() {
      return null;
    },
  });

  const service = createLocalIdentityService(repo);

  await assert.rejects(
    () => service.changePassword('opaque-token', {
      current_password: 'WrongPass123!',
      new_password: 'Replacement123!',
    }),
    (error) => (
      error.code === 'LOCAL_PASSWORD_CURRENT_INVALID'
      && error.statusCode === 400
      && error.message === 'Current password is incorrect'
    )
  );
});

test('password HTTP route accepts only bearer-authenticated service operation', async () => {
  let received = null;

  const localIdentityService = {
    async changePassword(token, body) {
      received = { token, body };
      return {
        success: true,
        password_changed_at: new Date().toISOString(),
        revoked_session_count: 0,
      };
    },
  };

  const server = http.createServer(
    createRequestHandler({ localIdentityService })
  );

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  try {
    const { port } = server.address();
    const response = await fetch(
      `http://127.0.0.1:${port}/api/v1/auth/local/password`,
      {
        method: 'PUT',
        headers: {
          authorization: 'Bearer current-session',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          current_password: 'CurrentPass123!',
          new_password: 'Replacement123!',
        }),
      }
    );

    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.success, true);
    assert.equal(received.token, 'current-session');
    assert.equal(
      received.body.current_password,
      'CurrentPass123!'
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('repository changes bcrypt password and revokes only other sessions', () => {
  const source = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      'services',
      'api',
      'src',
      'auth',
      'localIdentityRepository.js'
    ),
    'utf8'
  );

  assert.match(
    source,
    /password_hash = crypt\(\$3, gen_salt\('bf', 12\)\)/
  );
  assert.match(
    source,
    /password_hash = crypt\(\$2, c\.password_hash\)/
  );
  assert.match(source, /password_changed_at = NOW\(\)/);
  assert.match(source, /s\.session_id <> \$4/);
  assert.match(source, /s\.revoked_at IS NULL/);
});

test('web settings exposes current/new/confirm fields without persisting password', () => {
  const app = fs.readFileSync(
    path.join(__dirname, '..', 'apps', 'web', 'src', 'App.jsx'),
    'utf8'
  );
  const api = fs.readFileSync(
    path.join(__dirname, '..', 'apps', 'web', 'src', 'api.js'),
    'utf8'
  );
  const store = fs.readFileSync(
    path.join(__dirname, '..', 'apps', 'web', 'src', 'sessionStore.js'),
    'utf8'
  );

  assert.match(app, /AccountSettingsPanel/);
  assert.match(app, /Current password/);
  assert.match(app, /New password/);
  assert.match(app, /Confirm new password/);
  assert.match(app, /Change password/);
  assert.match(
    api,
    /\/api\/v1\/auth\/local\/password/
  );

  assert.doesNotMatch(store, /password/i);
});
