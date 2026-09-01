'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const {
  createLocalIdentityService,
  sha256,
} = require('../services/api/src/auth/localIdentityService');
const { createLocalIdentityProvider } = require('../services/api/src/integration/localIdentityProvider');
const { createIntegrationBoundaryService } = require('../services/api/src/integration/integrationBoundaryService');
const { createRequestHandler } = require('../services/api/src/app');
const { resolveProviderConfiguration } = require('../services/api/src/integration/providerConfiguration');

function activeLogin(overrides = {}) {
  return {
    identity_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    display_name: 'Alice Alpha',
    primary_email: 'alice.alpha@example.invalid',
    identity_status: 'ACTIVE',
    workspace_id: '11111111-1111-4111-8111-111111111111',
    workspace_code: 'DEV_ALPHA',
    workspace_name: 'AkshaConnect Dev Alpha',
    workspace_status: 'ACTIVE',
    workspace_member_id: 'e1111111-1111-4111-8111-111111111111',
    member_role: 'OWNER',
    member_status: 'ACTIVE',
    credential_status: 'ACTIVE',
    failed_attempts: 0,
    locked_until: null,
    password_matches: true,
    ...overrides,
  };
}

function repository(overrides = {}) {
  const calls = {
    created: null,
    failed: 0,
    reset: 0,
    touched: 0,
    revokedHash: null,
  };

  const repo = {
    async findLocalLogin() {
      return activeLogin();
    },
    async recordFailedLogin() {
      calls.failed += 1;
    },
    async resetFailedLogin() {
      calls.reset += 1;
    },
    async createSession(input) {
      calls.created = input;
      return {
        session_id: 's1111111-1111-4111-8111-111111111111',
        expires_at: input.expiresAt,
      };
    },
    async findActiveSession() {
      return {
        session_id: 's1111111-1111-4111-8111-111111111111',
        identity_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
        workspace_id: '11111111-1111-4111-8111-111111111111',
        workspace_member_id: 'e1111111-1111-4111-8111-111111111111',
        expires_at: new Date(Date.now() + 60000).toISOString(),
        display_name: 'Alice Alpha',
        primary_email: 'alice.alpha@example.invalid',
        identity_status: 'ACTIVE',
        workspace_code: 'DEV_ALPHA',
        workspace_name: 'AkshaConnect Dev Alpha',
        workspace_status: 'ACTIVE',
        member_role: 'OWNER',
        member_status: 'ACTIVE',
      };
    },
    async touchSession() {
      calls.touched += 1;
    },
    async revokeSession(tokenHash) {
      calls.revokedHash = tokenHash;
      return true;
    },
    async searchWorkspaceMembers() {
      return [{
        workspace_member_id: 'e1111111-1111-4111-8111-111111111111',
        identity_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
        display_name: 'Alice Alpha',
        member_role: 'OWNER',
      }];
    },
    ...overrides,
  };

  return { repo, calls };
}

test('LOCAL login returns opaque token but stores only its SHA-256 hash', async () => {
  const { repo, calls } = repository();
  const service = createLocalIdentityService(repo, { sessionTtlSeconds: 3600 });

  const result = await service.login({
    workspace_code: 'DEV_ALPHA',
    login_name: 'dev-alice',
    password: 'correct-password',
  });

  assert.equal(result.token_type, 'Bearer');
  assert.ok(result.access_token.length >= 40);
  assert.ok(calls.created);
  assert.equal(calls.created.tokenHash, sha256(result.access_token));
  assert.notEqual(calls.created.tokenHash, result.access_token);
  assert.equal(calls.reset, 1);
});

test('LOCAL login returns one generic error for invalid credentials', async () => {
  const { repo } = repository({
    async findLocalLogin() {
      return null;
    },
  });
  const service = createLocalIdentityService(repo);

  await assert.rejects(() => service.login({
    workspace_code: 'DEV_ALPHA',
    login_name: 'unknown',
    password: 'wrong',
  }), (error) => {
    assert.equal(error.code, 'LOCAL_AUTH_INVALID');
    assert.equal(error.statusCode, 401);
    assert.equal(error.message, 'Invalid workspace, login, or password');
    return true;
  });
});

test('wrong password records a failed attempt without revealing account state', async () => {
  const { repo, calls } = repository({
    async findLocalLogin() {
      return activeLogin({ password_matches: false });
    },
  });
  const service = createLocalIdentityService(repo);

  await assert.rejects(() => service.login({
    workspace_code: 'DEV_ALPHA',
    login_name: 'dev-alice',
    password: 'wrong',
  }), (error) => error.code === 'LOCAL_AUTH_INVALID');

  assert.equal(calls.failed, 1);
});

test('session verification returns provider-neutral trusted claims', async () => {
  const { repo, calls } = repository();
  const service = createLocalIdentityService(repo);
  const claims = await service.verifyAccessToken('opaque-session-token');

  assert.equal(claims.identity_provider, 'LOCAL');
  assert.equal(claims.identity_id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1');
  assert.equal(claims.workspace_id, '11111111-1111-4111-8111-111111111111');
  assert.equal(claims.workspace_member_id, 'e1111111-1111-4111-8111-111111111111');
  assert.equal(claims.user_id, undefined);
  assert.equal(claims.active_organization_id, undefined);
  assert.equal(calls.touched, 1);
});

test('disabled workspace/member/identity makes an existing session fail closed', async () => {
  const { repo } = repository({
    async findActiveSession() {
      return {
        session_id: 's1',
        identity_id: 'i1',
        workspace_id: 'w1',
        workspace_member_id: 'm1',
        identity_status: 'ACTIVE',
        workspace_status: 'SUSPENDED',
        member_status: 'ACTIVE',
      };
    },
  });
  const service = createLocalIdentityService(repo);

  await assert.rejects(
    () => service.verifyAccessToken('token'),
    (error) => error.code === 'LOCAL_SESSION_INVALID' && error.statusCode === 401
  );
});

test('logout hashes the bearer token before revocation', async () => {
  const { repo, calls } = repository();
  const service = createLocalIdentityService(repo);

  await service.logout('logout-token');
  assert.equal(calls.revokedHash, sha256('logout-token'));
});

test('LOCAL identity provider feeds neutral workspace context into integration boundary', async () => {
  const { repo } = repository();
  const service = createLocalIdentityService(repo);
  const identityGateway = createLocalIdentityProvider(service);

  const boundary = createIntegrationBoundaryService({
    identityGateway,
    businessGateway: {
      async searchRecords() {
        throw new Error('not used');
      },
      async executeAction() {
        throw new Error('not used');
      },
    },
    notificationPort: {
      async enqueuePush() {
        throw new Error('not used');
      },
    },
  });

  const context = await boundary.authenticate('local-token');
  assert.equal(context.workspace_id, '11111111-1111-4111-8111-111111111111');
  assert.equal(context.identity_id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1');

  const users = await boundary.searchUsers(context, {
    workspace_id: 'malicious-override',
    requester_member_id: 'malicious-override',
  });

  assert.equal(users[0].display_name, 'Alice Alpha');
});

test('LOCAL + AKSHAERP business provider fails closed until actor mapping exists', () => {
  assert.throws(() => resolveProviderConfiguration({
    AKSHACONNECT_IDENTITY_PROVIDER: 'LOCAL',
    AKSHACONNECT_BUSINESS_PROVIDER: 'AKSHAERP',
  }), (error) => {
    assert.equal(error.code, 'PROVIDER_COMBINATION_UNSUPPORTED');
    return true;
  });
});

async function withServer(service, run) {
  const server = http.createServer(createRequestHandler({ localIdentityService: service }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('local auth HTTP routes login, inspect session, and logout without echoing password', async () => {
  const { repo } = repository();
  const service = createLocalIdentityService(repo);

  await withServer(service, async (baseUrl) => {
    const password = 'do-not-echo-this';

    const login = await fetch(`${baseUrl}/api/v1/auth/local/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        workspace_code: 'DEV_ALPHA',
        login_name: 'dev-alice',
        password,
      }),
    });
    const loginPayload = await login.json();

    assert.equal(login.status, 200);
    assert.equal(JSON.stringify(loginPayload).includes(password), false);

    const session = await fetch(`${baseUrl}/api/v1/auth/session`, {
      headers: { authorization: `Bearer ${loginPayload.access_token}` },
    });
    const sessionPayload = await session.json();

    assert.equal(session.status, 200);
    assert.equal(sessionPayload.authenticated, true);
    assert.equal(sessionPayload.claims.workspace_code, 'DEV_ALPHA');

    const logout = await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: 'POST',
      headers: { authorization: `Bearer ${loginPayload.access_token}` },
    });
    const logoutPayload = await logout.json();

    assert.equal(logout.status, 200);
    assert.equal(logoutPayload.success, true);
  });
});

test('P1-V2 SQL never stores a raw access/session token column', () => {
  const migration = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      'database',
      'migrations',
      '202609011820__p1_v2_local_identity_session.sql'
    ),
    'utf8'
  );

  assert.match(migration, /token_hash CHAR\(64\) NOT NULL/);
  assert.doesNotMatch(migration, /\baccess_token\b/i);
  assert.doesNotMatch(migration, /\bsession_token\b/i);
  assert.match(
    migration,
    /FOREIGN KEY \(workspace_id, workspace_member_id, identity_id\)/
  );
});
