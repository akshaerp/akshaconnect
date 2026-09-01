'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');

const { boundaryError } = require('../services/api/src/core/boundaryError');
const { createRequestHandler } = require('../services/api/src/app');
const {
  normalizeChannelCode,
  createCollaborationService,
} = require('../services/api/src/collaboration/collaborationService');

const ALICE = 'e1111111-1111-4111-8111-111111111111';
const BOB = 'e2222222-2222-4222-8222-222222222222';
const CAROL = 'e3333333-3333-4333-8333-333333333333';
const WORKSPACE = '11111111-1111-4111-8111-111111111111';

function claims(overrides = {}) {
  return {
    identity_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    workspace_id: WORKSPACE,
    workspace_member_id: ALICE,
    session_id: '907b931d-33ee-487a-80e3-84bb29d3ffd9',
    identity_provider: 'LOCAL',
    member_role: 'OWNER',
    ...overrides,
  };
}

function activeMember(memberId = ALICE, role = 'OWNER') {
  return {
    workspace_member_id: memberId,
    identity_id: memberId === BOB
      ? 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
      : 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    member_role: role,
    member_status: 'ACTIVE',
    identity_status: 'ACTIVE',
    display_name: memberId === BOB ? 'Bob Alpha' : 'Alice Alpha',
    primary_email: null,
  };
}

function repository(overrides = {}) {
  const calls = {
    activeMembers: [],
    listChannels: null,
    createChannel: null,
    listDirectMessages: null,
    startDirectMessage: null,
  };

  const repo = {
    async getActiveWorkspaceMember(input) {
      calls.activeMembers.push(input);
      return activeMember(input.workspaceMemberId);
    },
    async listChannels(input) {
      calls.listChannels = input;
      return [{ channel_code: 'general' }];
    },
    async createChannel(input) {
      calls.createChannel = input;
      return {
        channel_id: 'c1',
        conversation_id: 'v1',
        channel_code: input.channelCode,
        channel_name: input.channelName,
        visibility: input.visibility,
        is_member: true,
        member_role: 'OWNER',
      };
    },
    async listDirectMessages(input) {
      calls.listDirectMessages = input;
      return [{ conversation_id: 'dm1', other_workspace_member_id: BOB }];
    },
    async startDirectMessage(input) {
      calls.startDirectMessage = input;
      return { created: true, conversation_id: 'dm1' };
    },
    ...overrides,
  };

  return { repo, calls };
}

test('channel code normalization is deterministic and Unicode-safe', () => {
  assert.equal(normalizeChannelCode('  Engineering Team  '), 'engineering-team');
  assert.equal(normalizeChannelCode('Sales___Ops'), 'sales___ops');
  assert.equal(normalizeChannelCode('తెలుగు టీమ్'), 'తెలుగు-టీమ్');
});

test('channel creation derives workspace and actor only from trusted claims', async () => {
  const { repo, calls } = repository();
  const service = createCollaborationService(repo);

  const result = await service.createChannel(claims(), {
    workspace_id: 'malicious-workspace',
    created_by_member_id: CAROL,
    channel_name: 'Engineering Team',
    visibility: 'public',
  });

  assert.equal(result.channel_code, 'engineering-team');
  assert.equal(calls.createChannel.workspaceId, WORKSPACE);
  assert.equal(calls.createChannel.requesterMemberId, ALICE);
  assert.equal(calls.createChannel.channelName, 'Engineering Team');
  assert.equal(calls.createChannel.visibility, 'PUBLIC');
  assert.equal(calls.createChannel.workspace_id, undefined);
  assert.equal(calls.createChannel.created_by_member_id, undefined);
});

test('guest workspace member cannot create a channel', async () => {
  const { repo } = repository({
    async getActiveWorkspaceMember(input) {
      return activeMember(input.workspaceMemberId, 'GUEST');
    },
  });
  const service = createCollaborationService(repo);

  await assert.rejects(
    () => service.createChannel(claims(), { channel_name: 'Guest Channel' }),
    (error) => error.code === 'CHANNEL_CREATE_FORBIDDEN' && error.statusCode === 403
  );
});

test('duplicate channel code becomes stable 409 boundary error', async () => {
  const { repo } = repository({
    async createChannel() {
      const error = new Error('duplicate');
      error.code = '23505';
      throw error;
    },
  });
  const service = createCollaborationService(repo);

  await assert.rejects(
    () => service.createChannel(claims(), {
      channel_name: 'Engineering',
      channel_code: 'ENGINEERING',
    }),
    (error) => error.code === 'CHANNEL_CODE_EXISTS' && error.statusCode === 409
  );
});

test('channel listing is scoped to verified workspace and member', async () => {
  const { repo, calls } = repository();
  const service = createCollaborationService(repo);
  const rows = await service.listChannels(claims());

  assert.equal(rows.length, 1);
  assert.deepEqual(calls.listChannels, {
    workspaceId: WORKSPACE,
    requesterMemberId: ALICE,
  });
});

test('self direct message is rejected before repository creation', async () => {
  const { repo, calls } = repository();
  const service = createCollaborationService(repo);

  await assert.rejects(
    () => service.startDirectMessage(claims(), {
      target_workspace_member_id: ALICE,
    }),
    (error) => error.code === 'DIRECT_MESSAGE_TARGET_INVALID' && error.statusCode === 400
  );

  assert.equal(calls.startDirectMessage, null);
});

test('cross-workspace or inactive direct-message target fails closed', async () => {
  const { repo } = repository({
    async getActiveWorkspaceMember(input) {
      if (input.workspaceMemberId === ALICE) return activeMember(ALICE);
      return null;
    },
  });
  const service = createCollaborationService(repo);

  await assert.rejects(
    () => service.startDirectMessage(claims(), {
      workspace_id: 'malicious-workspace',
      target_workspace_member_id: CAROL,
    }),
    (error) => error.code === 'DIRECT_MESSAGE_TARGET_INVALID' && error.statusCode === 404
  );
});

test('direct-message creation passes only trusted workspace scope', async () => {
  const { repo, calls } = repository({
    async getActiveWorkspaceMember(input) {
      return input.workspaceMemberId === BOB
        ? activeMember(BOB, 'MEMBER')
        : activeMember(ALICE);
    },
  });
  const service = createCollaborationService(repo);

  const result = await service.startDirectMessage(claims(), {
    workspace_id: 'malicious-workspace',
    requester_member_id: CAROL,
    target_workspace_member_id: BOB,
  });

  assert.equal(result.created, true);
  assert.deepEqual(calls.startDirectMessage, {
    workspaceId: WORKSPACE,
    requesterMemberId: ALICE,
    targetMemberId: BOB,
  });
});

test('direct-message listing is scoped to verified workspace and member', async () => {
  const { repo, calls } = repository();
  const service = createCollaborationService(repo);
  const rows = await service.listDirectMessages(claims());

  assert.equal(rows[0].other_workspace_member_id, BOB);
  assert.deepEqual(calls.listDirectMessages, {
    workspaceId: WORKSPACE,
    requesterMemberId: ALICE,
  });
});

async function withServer(options, run) {
  const server = http.createServer(createRequestHandler(options));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function httpServices() {
  const calls = {
    verifiedTokens: [],
    memberSearch: null,
    channelCreate: null,
    channelList: 0,
    dmStart: null,
    dmList: 0,
  };

  const localIdentityService = {
    async verifyAccessToken(token) {
      calls.verifiedTokens.push(token);
      if (token !== 'good-token') {
        throw boundaryError('LOCAL_SESSION_INVALID', 'Session is invalid or expired', 401);
      }
      return claims();
    },
    async searchUsers(input) {
      calls.memberSearch = input;
      return [{ workspace_member_id: BOB, display_name: 'Bob Alpha' }];
    },
  };

  const collaborationService = {
    async listChannels() {
      calls.channelList += 1;
      return [{ channel_code: 'general' }];
    },
    async createChannel(receivedClaims, body) {
      calls.channelCreate = { receivedClaims, body };
      return { channel_id: 'c1', channel_code: 'engineering' };
    },
    async listDirectMessages() {
      calls.dmList += 1;
      return [{ conversation_id: 'dm1' }];
    },
    async startDirectMessage(receivedClaims, body) {
      calls.dmStart = { receivedClaims, body };
      return { created: true, conversation_id: 'dm1' };
    },
  };

  return { localIdentityService, collaborationService, calls };
}

test('P1-V3 HTTP routes authenticate and expose member/channel/DM APIs', async () => {
  const services = httpServices();

  await withServer(services, async (baseUrl) => {
    const headers = {
      authorization: 'Bearer good-token',
      'content-type': 'application/json',
    };

    const members = await fetch(`${baseUrl}/api/v1/workspace/members?query=bob&limit=10`, {
      headers: { authorization: 'Bearer good-token' },
    });
    const membersPayload = await members.json();
    assert.equal(members.status, 200);
    assert.equal(membersPayload.members[0].display_name, 'Bob Alpha');
    assert.deepEqual(services.calls.memberSearch, {
      workspace_id: WORKSPACE,
      requester_member_id: ALICE,
      search_text: 'bob',
      limit: '10',
    });

    const createChannel = await fetch(`${baseUrl}/api/v1/channels`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ channel_name: 'Engineering' }),
    });
    assert.equal(createChannel.status, 201);

    const listChannels = await fetch(`${baseUrl}/api/v1/channels`, {
      headers: { authorization: 'Bearer good-token' },
    });
    assert.equal(listChannels.status, 200);

    const startDm = await fetch(`${baseUrl}/api/v1/direct-messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ target_workspace_member_id: BOB }),
    });
    const startDmPayload = await startDm.json();
    assert.equal(startDm.status, 201);
    assert.equal(startDmPayload.direct_message.created, true);

    const listDm = await fetch(`${baseUrl}/api/v1/direct-messages`, {
      headers: { authorization: 'Bearer good-token' },
    });
    assert.equal(listDm.status, 200);

    assert.equal(services.calls.channelCreate.receivedClaims.workspace_id, WORKSPACE);
    assert.equal(services.calls.dmStart.receivedClaims.workspace_id, WORKSPACE);
    assert.equal(services.calls.channelList, 1);
    assert.equal(services.calls.dmList, 1);
  });
});

test('P1-V3 collaboration HTTP routes reject invalid bearer session', async () => {
  const services = httpServices();

  await withServer(services, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/channels`, {
      headers: { authorization: 'Bearer bad-token' },
    });
    const payload = await response.json();

    assert.equal(response.status, 401);
    assert.equal(payload.error.code, 'LOCAL_SESSION_INVALID');
  });
});

test('P1-V3 SQL structurally prevents duplicate/cross-type DMs and case-variant channels', () => {
  const migration = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      'database',
      'migrations',
      '202609011950__p1_v3_channel_direct_message_api.sql'
    ),
    'utf8'
  );

  assert.match(migration, /CREATE UNIQUE INDEX uq_ac_channel_code_ci/i);
  assert.match(migration, /LOWER\(channel_code\)/i);
  assert.match(
    migration,
    /PRIMARY KEY \(workspace_id, member_a_id, member_b_id\)/i
  );
  assert.match(migration, /CHECK \(member_a_id < member_b_id\)/i);
  assert.match(migration, /CHECK \(conversation_type = 'DM'\)/i);
  assert.match(
    migration,
    /FOREIGN KEY \(workspace_id, conversation_id, conversation_type\)/i
  );
});

test('P1-V3 collaboration core contains no AkshaERP module/function/table contract', () => {
  const service = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      'services',
      'api',
      'src',
      'collaboration',
      'collaborationService.js'
    ),
    'utf8'
  );
  const repositorySource = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      'services',
      'api',
      'src',
      'collaboration',
      'collaborationRepository.js'
    ),
    'utf8'
  );
  const combined = `${service}\n${repositorySource}`;

  assert.doesNotMatch(combined, /sec_effective_user_actions/i);
  assert.doesNotMatch(combined, /function_code/i);
  assert.doesNotMatch(combined, /module_code/i);
  assert.doesNotMatch(combined, /akshaerp\./i);
});
