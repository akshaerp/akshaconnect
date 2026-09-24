'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createProviderDirectoryService,
} = require('../services/api/src/auth/providerDirectoryService');

function claims(provider = 'AKSHAERP') {
  return {
    identity_id: '11111111-1111-1111-1111-111111111111',
    workspace_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    workspace_member_id: '22222222-2222-2222-2222-222222222222',
    identity_provider: provider,
  };
}

test('empty search lists only existing AkshaConnect workspace members', async () => {
  let erpCalled = false;
  let contextCalled = false;

  const service = createProviderDirectoryService({
    identityProvider: 'AKSHAERP',
    localIdentityService: {
      async searchUsers(input) {
        assert.equal(input.search_text, '');
        return [{
          workspace_member_id: 'existing-member',
          display_name: 'Existing Member',
        }];
      },
    },
    identityGateway: {
      async searchUsers() {
        erpCalled = true;
        return [];
      },
    },
    erpDirectoryRepository: {
      async getTrustedDirectoryContext() {
        contextCalled = true;
      },
      async provisionDirectoryUser() {
        throw new Error('not expected');
      },
    },
  });

  const rows = await service.searchUsers(claims(), {
    search_text: '',
    limit: 50,
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].workspace_member_id, 'existing-member');
  assert.equal(erpCalled, false);
  assert.equal(contextCalled, false);
});

test('AKSHAERP search uses trusted server context and JIT-provisions ERP results', async () => {
  const calls = [];
  const service = createProviderDirectoryService({
    identityProvider: 'AKSHAERP',
    localIdentityService: {
      async searchUsers(input) {
        calls.push(['local', input]);
        return [{
          workspace_member_id: 'existing-member',
          display_name: 'Existing Member',
        }];
      },
    },
    identityGateway: {
      async searchUsers(input) {
        calls.push(['erp', input]);
        return [
          {
            user_id: 7,
            username: 'malli',
            akshamail: 'malli@akshamail',
            display_name: 'Mallikarjuna Rao',
            is_active: true,
          },
          {
            user_id: 8,
            username: 'inactive',
            display_name: 'Inactive Person',
            is_active: false,
          },
        ];
      },
    },
    erpDirectoryRepository: {
      async getTrustedDirectoryContext(input) {
        calls.push(['context', input]);
        return {
          connect_tenant_id: 'tenant-uuid',
          erp_tenant_id: 'APP',
          organization_id: 11,
          requester_user_id: 2,
        };
      },
      async provisionDirectoryUser(input) {
        calls.push(['provision', input]);
        return {
          available: true,
          workspace_member_id: 'erp-member-7',
          identity_id: 'erp-identity-7',
          display_name: input.user.display_name,
          primary_email: input.user.akshamail,
          member_role: 'MEMBER',
        };
      },
    },
  });

  const rows = await service.searchUsers(claims(), {
    search_text: 'Mall',
    limit: 50,
  });

  const erpCall = calls.find(([kind]) => kind === 'erp');
  assert.deepEqual(erpCall[1], {
    tenant_id: 'APP',
    organization_id: 11,
    requester_user_id: 2,
    search_text: 'Mall',
    limit: 50,
  });

  const provisionCalls = calls.filter(([kind]) => kind === 'provision');
  assert.equal(provisionCalls.length, 1);
  assert.equal(provisionCalls[0][1].workspaceId, claims().workspace_id);
  assert.equal(provisionCalls[0][1].connectTenantId, 'tenant-uuid');

  assert.equal(rows.length, 2);
  assert.equal(rows[0].workspace_member_id, 'existing-member');
  assert.equal(rows[1].workspace_member_id, 'erp-member-7');
});

test('LOCAL session never calls the ERP user directory', async () => {
  let erpCalled = false;

  const service = createProviderDirectoryService({
    identityProvider: 'AKSHAERP',
    localIdentityService: {
      async searchUsers() {
        return [{
          workspace_member_id: 'local-only',
          display_name: 'Local Only',
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
      async provisionDirectoryUser() {
        throw new Error('not expected');
      },
    },
  });

  const rows = await service.searchUsers(
    claims('LOCAL'),
    { search_text: 'person' }
  );

  assert.equal(rows.length, 1);
  assert.equal(erpCalled, false);
});

test('AKSHAERP search refuses missing trusted ERP directory context', async () => {
  const service = createProviderDirectoryService({
    identityProvider: 'AKSHAERP',
    localIdentityService: {
      async searchUsers() {
        return [];
      },
    },
    identityGateway: {
      async searchUsers() {
        throw new Error('must not call ERP');
      },
    },
    erpDirectoryRepository: {
      async getTrustedDirectoryContext() {
        return {
          connect_tenant_id: 'tenant-uuid',
          erp_tenant_id: 'APP',
          organization_id: null,
          requester_user_id: 2,
        };
      },
      async provisionDirectoryUser() {
        throw new Error('not expected');
      },
    },
  });

  await assert.rejects(
    () => service.searchUsers(
      claims(),
      { search_text: 'Mallikarjuna' }
    ),
    (error) => {
      assert.equal(
        error.code,
        'AKSHAERP_DIRECTORY_CONTEXT_INVALID'
      );
      assert.equal(error.statusCode, 403);
      return true;
    }
  );
});
