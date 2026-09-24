'use strict';

const http = require('node:http');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AKSHAERP_DIRECTORY_MEMBER_PREFIX,
  createProviderDirectoryService,
} = require('../services/api/src/auth/providerDirectoryService');
const {
  createWorkspaceDirectoryHttpHandler,
} = require('../services/api/src/auth/workspaceDirectoryHttpHandler');

function claims(provider = 'AKSHAERP') {
  return {
    identity_id: '11111111-1111-1111-1111-111111111111',
    workspace_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    workspace_member_id: '22222222-2222-2222-2222-222222222222',
    identity_provider: provider,
  };
}

function erpContext() {
  return {
    connect_tenant_id: 'tenant-uuid',
    erp_tenant_id: 'APP',
    organization_id: 11,
    requester_user_id: 2,
  };
}

test('AKSHAERP empty picker loads live ERP users without provisioning them', async () => {
  const calls = [];
  const service = createProviderDirectoryService({
    identityProvider: 'AKSHAERP',
    localIdentityService: {
      async searchUsers() {
        throw new Error('local directory must not be used');
      },
    },
    identityGateway: {
      async searchUsers(input) {
        calls.push(['erp', input]);
        return [
          {
            user_id: 7,
            display_name: 'Mallikarjuna Rao',
            akshamail: 'malli@akshamail',
            is_active: true,
          },
          {
            user_id: 8,
            display_name: 'Another User',
            email: 'another@example.com',
            is_active: true,
          },
        ];
      },
    },
    erpDirectoryRepository: {
      async getTrustedDirectoryContext() {
        return erpContext();
      },
      async decorateDirectoryUsers(input) {
        calls.push(['decorate', input]);
        return input.users.map((user) => ({
          workspace_member_id:
            `${AKSHAERP_DIRECTORY_MEMBER_PREFIX}${user.user_id}`,
          identity_id: null,
          display_name: user.display_name,
          primary_email: user.akshamail || user.email || null,
          member_role: 'MEMBER',
          directory_provider: 'AKSHAERP',
          external_user_id: user.user_id,
          provisioned: false,
        }));
      },
      async provisionDirectoryUser() {
        calls.push(['provision']);
        throw new Error('search must not provision');
      },
    },
  });

  const rows = await service.searchUsers(
    claims(),
    { search_text: '', limit: 50 }
  );

  assert.equal(rows.length, 2);
  assert.equal(
    rows[0].workspace_member_id,
    'dir:AKSHAERP:7'
  );
  assert.equal(rows[0].provisioned, false);
  assert.equal(
    calls.filter(([kind]) => kind === 'provision').length,
    0
  );

  const erpCall = calls.find(([kind]) => kind === 'erp');
  assert.deepEqual(erpCall[1], {
    tenant_id: 'APP',
    organization_id: 11,
    requester_user_id: 2,
    search_text: '',
    limit: 50,
  });
});

test('AKSHAERP typed search remains live ERP directory search without JIT writes', async () => {
  let provisioned = false;

  const service = createProviderDirectoryService({
    identityProvider: 'AKSHAERP',
    localIdentityService: {
      async searchUsers() {
        throw new Error('not expected');
      },
    },
    identityGateway: {
      async searchUsers(input) {
        assert.equal(input.search_text, 'Mall');
        return [{
          user_id: 7,
          display_name: 'Mallikarjuna Rao',
          is_active: true,
        }];
      },
    },
    erpDirectoryRepository: {
      async getTrustedDirectoryContext() {
        return erpContext();
      },
      async decorateDirectoryUsers({ users }) {
        return [{
          workspace_member_id: 'dir:AKSHAERP:7',
          display_name: users[0].display_name,
          directory_provider: 'AKSHAERP',
          external_user_id: 7,
          provisioned: false,
        }];
      },
      async provisionDirectoryUser() {
        provisioned = true;
      },
    },
  });

  const rows = await service.searchUsers(
    claims(),
    { search_text: 'Mall', limit: 50 }
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].display_name, 'Mallikarjuna Rao');
  assert.equal(provisioned, false);
});

test('LOCAL identity continues to use only the local AkshaConnect directory', async () => {
  let erpCalled = false;

  const service = createProviderDirectoryService({
    identityProvider: 'AKSHAERP',
    localIdentityService: {
      async searchUsers(input) {
        assert.equal(input.search_text, 'local');
        return [{
          workspace_member_id: 'local-member',
          display_name: 'Local User',
        }];
      },
    },
    identityGateway: {
      async searchUsers() {
        erpCalled = true;
      },
    },
    erpDirectoryRepository: {
      async getTrustedDirectoryContext() {
        throw new Error('not expected');
      },
      async decorateDirectoryUsers() {
        throw new Error('not expected');
      },
      async provisionDirectoryUser() {
        throw new Error('not expected');
      },
    },
  });

  const rows = await service.searchUsers(
    claims('LOCAL'),
    { search_text: 'local' }
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].workspace_member_id, 'local-member');
  assert.equal(erpCalled, false);
});

test('selected synthetic ERP directory target is exact-revalidated and JIT-provisioned only on click', async () => {
  const calls = [];

  const service = createProviderDirectoryService({
    identityProvider: 'AKSHAERP',
    localIdentityService: {
      async searchUsers() {
        throw new Error('not expected');
      },
    },
    identityGateway: {
      async searchUsers(input) {
        calls.push(['erp', input]);
        return [{
          user_id: 7,
          display_name: 'Mallikarjuna Rao',
          akshamail: 'malli@akshamail',
          is_active: true,
        }];
      },
    },
    erpDirectoryRepository: {
      async getTrustedDirectoryContext() {
        return erpContext();
      },
      async decorateDirectoryUsers() {
        throw new Error('not expected');
      },
      async provisionDirectoryUser(input) {
        calls.push(['provision', input]);
        return {
          available: true,
          workspace_member_id:
            '77777777-7777-7777-7777-777777777777',
          identity_id:
            '88888888-8888-8888-8888-888888888888',
          display_name:
            input.user.display_name,
          primary_email:
            input.user.akshamail,
          member_role: 'MEMBER',
          external_user_id: 7,
        };
      },
    },
  });

  const member = await service.resolveTargetMember(
    claims(),
    { directory_member_id: 'dir:AKSHAERP:7' }
  );

  const erpCall = calls.find(([kind]) => kind === 'erp');
  assert.deepEqual(erpCall[1], {
    tenant_id: 'APP',
    organization_id: 11,
    requester_user_id: 2,
    user_id: 7,
    search_text: '',
    limit: 1,
  });

  assert.equal(
    calls.filter(([kind]) => kind === 'provision').length,
    1
  );
  assert.equal(
    member.workspace_member_id,
    '77777777-7777-7777-7777-777777777777'
  );
});

test('direct-message POST resolves synthetic directory id before provider-neutral DM creation', async () => {
  let directInput = null;
  let resolvedInput = null;

  const handler = createWorkspaceDirectoryHttpHandler({
    identityService: {
      async verifyAccessToken(token) {
        assert.equal(token, 'connect-token');
        return claims();
      },
    },
    directoryService: {
      async searchUsers() {
        throw new Error('not expected');
      },
      isDirectoryMemberId(value) {
        return value === 'dir:AKSHAERP:7';
      },
      async resolveTargetMember(_claims, input) {
        resolvedInput = input;
        return {
          workspace_member_id:
            '77777777-7777-7777-7777-777777777777',
        };
      },
    },
    collaborationService: {
      async startDirectMessage(_claims, input) {
        directInput = input;
        return {
          created: true,
          conversation_id: 'conversation-1',
        };
      },
    },
  });

  const server = http.createServer(async (req, res) => {
    const handled = await handler(req, res);
    if (!handled) {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  try {
    const address = server.address();
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/v1/direct-messages`,
      {
        method: 'POST',
        headers: {
          authorization: 'Bearer connect-token',
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          target_workspace_member_id:
            'dir:AKSHAERP:7',
        }),
      }
    );

    assert.equal(response.status, 201);
    const payload = await response.json();
    assert.equal(
      payload.direct_message.conversation_id,
      'conversation-1'
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  assert.deepEqual(resolvedInput, {
    directory_member_id: 'dir:AKSHAERP:7',
  });
  assert.equal(
    directInput.target_workspace_member_id,
    '77777777-7777-7777-7777-777777777777'
  );
});

test('existing real workspace member id bypasses provider resolution and keeps normal DM behavior', async () => {
  let resolveCalled = false;
  let targetSeen = null;

  const handler = createWorkspaceDirectoryHttpHandler({
    identityService: {
      async verifyAccessToken() {
        return claims();
      },
    },
    directoryService: {
      async searchUsers() {
        throw new Error('not expected');
      },
      isDirectoryMemberId() {
        return false;
      },
      async resolveTargetMember() {
        resolveCalled = true;
      },
    },
    collaborationService: {
      async startDirectMessage(_claims, input) {
        targetSeen = input.target_workspace_member_id;
        return {
          created: false,
          conversation_id: 'existing-conversation',
        };
      },
    },
  });

  const server = http.createServer(async (req, res) => {
    const handled = await handler(req, res);
    if (!handled) {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  try {
    const address = server.address();
    const target =
      '99999999-9999-9999-9999-999999999999';

    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/v1/direct-messages`,
      {
        method: 'POST',
        headers: {
          authorization: 'Bearer connect-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          target_workspace_member_id: target,
        }),
      }
    );

    assert.equal(response.status, 200);
    assert.equal(targetSeen, target);
    assert.equal(resolveCalled, false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
