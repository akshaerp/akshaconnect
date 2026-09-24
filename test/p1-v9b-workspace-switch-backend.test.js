'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createWorkspaceSessionService,
} = require('../services/api/src/auth/workspaceSessionService');

function claims() {
  return {
    identity_id: '11111111-1111-1111-1111-111111111111',
    workspace_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    workspace_member_id: '22222222-2222-2222-2222-222222222222',
    session_id: '33333333-3333-3333-3333-333333333333',
    identity_provider: 'AKSHAERP',
    display_name: 'Admin MFG',
    primary_email: 'admin@akshamail',
    workspace_code: 'AKSHAERP',
    workspace_name: 'AkshaERP Solutions Private Limited',
    member_role: 'OWNER',
  };
}

function rows() {
  return [
    {
      workspace_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      workspace_member_id: '22222222-2222-2222-2222-222222222222',
      workspace_code: 'AKSHAERP',
      workspace_name: 'AkshaERP Solutions Private Limited',
      member_role: 'OWNER',
      default_flag: 'Y',
    },
    {
      workspace_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      workspace_member_id: '44444444-4444-4444-4444-444444444444',
      workspace_code: 'DEVELOPMENT',
      workspace_name: 'Development',
      member_role: 'MEMBER',
      default_flag: 'N',
    },
  ];
}

test('lists only repository-approved workspaces and marks the active workspace', async () => {
  const service = createWorkspaceSessionService({
    identityService: {
      async verifyAccessToken(token) {
        assert.equal(token, 'current-token');
        return claims();
      },
    },
    repository: {
      async listAvailableWorkspaces(input) {
        assert.equal(input.identityId, claims().identity_id);
        assert.equal(input.currentWorkspaceId, claims().workspace_id);
        return rows();
      },
      async replaceSession() {
        throw new Error('not expected');
      },
    },
  });

  const result = await service.listWorkspaces('current-token');
  assert.equal(result.active_workspace_id, claims().workspace_id);
  assert.equal(result.workspaces.length, 2);
  assert.equal(result.workspaces[0].workspace_name, 'AkshaERP Solutions Private Limited');
  assert.equal(result.workspaces[0].active_flag, 'Y');
  assert.equal(result.workspaces[1].active_flag, 'N');
});

test('switch creates a replacement session without changing identity provider', async () => {
  let replaceInput = null;

  const service = createWorkspaceSessionService({
    identityService: {
      async verifyAccessToken() {
        return claims();
      },
    },
    repository: {
      async listAvailableWorkspaces() {
        return rows();
      },
      async replaceSession(input) {
        replaceInput = input;
        return {
          session: {
            session_id: '55555555-5555-5555-5555-555555555555',
            expires_at: '2026-09-24T23:00:00.000Z',
          },
          workspace: {
            workspace_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
            workspace_code: 'DEVELOPMENT',
            workspace_name: 'Development',
          },
          membership: {
            workspace_member_id: '44444444-4444-4444-4444-444444444444',
            member_role: 'MEMBER',
          },
          identity_provider: 'AKSHAERP',
        };
      },
    },
  });

  const result = await service.switchWorkspace(
    'current-token',
    { workspace_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' },
    { userAgent: 'test-agent', clientIp: '127.0.0.1' }
  );

  assert.equal(replaceInput.sessionId, claims().session_id);
  assert.equal(replaceInput.currentWorkspaceId, claims().workspace_id);
  assert.equal(replaceInput.targetWorkspaceId, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
  assert.notEqual(replaceInput.tokenHash, 'current-token');
  assert.equal(result.switched, true);
  assert.equal(result.identity.identity_provider, 'AKSHAERP');
  assert.equal(result.workspace.workspace_name, 'Development');
  assert.equal(result.membership.member_role, 'MEMBER');
  assert.equal(result.workspaces[1].active_flag, 'Y');
  assert.equal(typeof result.access_token, 'string');
  assert.ok(result.access_token.length >= 40);
});

test('switch denies a workspace that is not in the repository-approved list', async () => {
  const service = createWorkspaceSessionService({
    identityService: {
      async verifyAccessToken() {
        return claims();
      },
    },
    repository: {
      async listAvailableWorkspaces() {
        return [rows()[0]];
      },
      async replaceSession() {
        throw new Error('must not replace');
      },
    },
  });

  await assert.rejects(
    () => service.switchWorkspace(
      'current-token',
      { workspace_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' }
    ),
    (error) => {
      assert.equal(error.code, 'WORKSPACE_SWITCH_ACCESS_DENIED');
      assert.equal(error.statusCode, 403);
      return true;
    }
  );
});

test('selecting the already-active workspace is a safe no-op', async () => {
  let replaceCalled = false;

  const service = createWorkspaceSessionService({
    identityService: {
      async verifyAccessToken() {
        return claims();
      },
    },
    repository: {
      async listAvailableWorkspaces() {
        return rows();
      },
      async replaceSession() {
        replaceCalled = true;
      },
    },
  });

  const result = await service.switchWorkspace(
    'current-token',
    { workspace_id: claims().workspace_id }
  );

  assert.equal(result.switched, false);
  assert.equal(result.access_token, 'current-token');
  assert.equal(result.session_id, claims().session_id);
  assert.equal(replaceCalled, false);
});
