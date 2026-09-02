'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');
const { createRequestHandler } = require('../services/api/src/app');
const {
  parseHistoryLimit,
  validateHumanMessageInput,
  createMessagingService,
} = require('../services/api/src/messaging/messagingService');

const CLAIMS = Object.freeze({
  workspace_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  workspace_member_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  identity_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
});

function message(overrides = {}) {
  return {
    message_id: '11111111-1111-4111-8111-111111111111',
    conversation_id: '22222222-2222-4222-8222-222222222222',
    sender_type: 'HUMAN',
    sender_member_id: CLAIMS.workspace_member_id,
    system_sender_id: null,
    message_type: 'TEXT',
    body_text: 'hello',
    client_message_id: 'client-1',
    source_event_id: null,
    reply_to_message_id: null,
    sender_display_name: 'Alice Alpha',
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function repository(overrides = {}) {
  return {
    async getActiveWorkspaceMember() {
      return { workspace_member_id: CLAIMS.workspace_member_id, identity_status: 'ACTIVE' };
    },
    async getConversationAccess() {
      return { conversation_id: '22222222-2222-4222-8222-222222222222', conversation_type: 'DM' };
    },
    async getActiveConversation() {
      return { conversation_id: '22222222-2222-4222-8222-222222222222', conversation_type: 'DM' };
    },
    async getMessageInConversation() { return message(); },
    async findHumanMessageByClientId() { return null; },
    async createHumanMessage(input) { return message({ body_text: input.bodyText, client_message_id: input.clientMessageId }); },
    async listMessages() { return { rows: [message()], hasMore: false, nextBeforeMessageId: null, cursorInvalid: false }; },
    async getReadCursor() { return null; },
    async advanceReadCursor(input) { return { last_read_message_id: input.lastReadMessageId, advanced: true }; },
    async getActiveSystemSender() { return { system_sender_id: '33333333-3333-4333-8333-333333333333' }; },
    async findSystemMessageBySourceEvent() { return null; },
    async createSystemMessage(input) {
      return message({
        sender_type: 'SYSTEM',
        sender_member_id: null,
        system_sender_id: input.systemSenderId,
        message_type: input.messageType,
        body_text: input.bodyText,
        source_event_id: input.sourceEventId,
        client_message_id: null,
      });
    },
    ...overrides,
  };
}

test('human message input requires body and client id and never accepts sender authority', () => {
  const validated = validateHumanMessageInput({
    body_text: ' hello ',
    client_message_id: 'client-1',
    sender_type: 'SYSTEM',
    sender_member_id: 'attacker',
  });
  assert.deepEqual(validated, {
    bodyText: 'hello',
    clientMessageId: 'client-1',
    replyToMessageId: null,
  });
  assert.throws(() => validateHumanMessageInput({ body_text: ' ', client_message_id: 'x' }), /Message body/);
});

test('human send derives workspace and sender only from verified claims', async () => {
  let captured;
  const service = createMessagingService(repository({
    async createHumanMessage(input) {
      captured = input;
      return message({ body_text: input.bodyText, client_message_id: input.clientMessageId });
    },
  }));
  const result = await service.sendHumanMessage(CLAIMS, message().conversation_id, {
    body_text: 'hello',
    client_message_id: 'client-1',
    workspace_id: 'evil',
    sender_member_id: 'evil',
    sender_type: 'SYSTEM',
  });
  assert.equal(result.created, true);
  assert.equal(captured.workspaceId, CLAIMS.workspace_id);
  assert.equal(captured.senderMemberId, CLAIMS.workspace_member_id);
  assert.equal('senderType' in captured, false);
});

test('conversation access is mandatory for history and send', async () => {
  const service = createMessagingService(repository({ async getConversationAccess() { return null; } }));
  await assert.rejects(
    service.listMessages(CLAIMS, message().conversation_id),
    (error) => error.code === 'CONVERSATION_ACCESS_DENIED' && error.statusCode === 404
  );
  await assert.rejects(
    service.sendHumanMessage(CLAIMS, message().conversation_id, { body_text: 'x', client_message_id: 'c' }),
    (error) => error.code === 'CONVERSATION_ACCESS_DENIED'
  );
});

test('same client message id with identical semantics is idempotent', async () => {
  const existing = message();
  const service = createMessagingService(repository({ async findHumanMessageByClientId() { return existing; } }));
  const result = await service.sendHumanMessage(CLAIMS, existing.conversation_id, {
    body_text: existing.body_text,
    client_message_id: existing.client_message_id,
  });
  assert.equal(result.created, false);
  assert.equal(result.message.message_id, existing.message_id);
});

test('same client message id with changed content fails with stable 409', async () => {
  const service = createMessagingService(repository({ async findHumanMessageByClientId() { return message(); } }));
  await assert.rejects(
    service.sendHumanMessage(CLAIMS, message().conversation_id, {
      body_text: 'different',
      client_message_id: 'client-1',
    }),
    (error) => error.code === 'MESSAGE_IDEMPOTENCY_CONFLICT' && error.statusCode === 409
  );
});

test('concurrent duplicate human send resolves the committed winner', async () => {
  let lookups = 0;
  const winner = message();
  const service = createMessagingService(repository({
    async findHumanMessageByClientId() {
      lookups += 1;
      return lookups === 1 ? null : winner;
    },
    async createHumanMessage() {
      const error = new Error('duplicate');
      error.code = '23505';
      error.constraint = 'uq_ac_message_client_id';
      throw error;
    },
  }));
  const result = await service.sendHumanMessage(CLAIMS, winner.conversation_id, {
    body_text: winner.body_text,
    client_message_id: winner.client_message_id,
  });
  assert.equal(result.created, false);
  assert.equal(result.message.message_id, winner.message_id);
});

test('history limits are bounded and service exposes stable page metadata', async () => {
  assert.equal(parseHistoryLimit(undefined), 50);
  assert.equal(parseHistoryLimit('100'), 100);
  assert.throws(() => parseHistoryLimit('101'), /limit must be between/);
  const service = createMessagingService(repository());
  const result = await service.listMessages(CLAIMS, message().conversation_id, { limit: 25 });
  assert.equal(result.page.limit, 25);
  assert.equal(result.messages.length, 1);
});

test('foreign history cursor fails closed', async () => {
  const service = createMessagingService(repository({
    async listMessages() { return { cursorInvalid: true, rows: [], hasMore: false, nextBeforeMessageId: null }; },
  }));
  await assert.rejects(
    service.listMessages(CLAIMS, message().conversation_id, { before_message_id: 'foreign' }),
    (error) => error.code === 'MESSAGE_HISTORY_CURSOR_INVALID'
  );
});

test('read cursor accepts only a message from the authorized conversation', async () => {
  const service = createMessagingService(repository({ async getMessageInConversation() { return null; } }));
  await assert.rejects(
    service.advanceReadCursor(CLAIMS, message().conversation_id, { last_read_message_id: 'foreign' }),
    (error) => error.code === 'READ_CURSOR_MESSAGE_INVALID'
  );
});

test('trusted SystemSender path is internal authority and source-event idempotent', async () => {
  const service = createMessagingService(repository());
  await assert.rejects(
    service.publishTrustedSystemMessage({}, message().conversation_id, { source_event_id: 'evt-1', body_text: 'System' }),
    (error) => error.code === 'SYSTEM_SENDER_AUTHORITY_REQUIRED'
  );
  const authority = {
    trusted_system_sender: true,
    workspace_id: CLAIMS.workspace_id,
    system_sender_id: '33333333-3333-4333-8333-333333333333',
  };
  const created = await service.publishTrustedSystemMessage(authority, message().conversation_id, {
    source_event_id: 'evt-1',
    body_text: 'System',
  });
  assert.equal(created.created, true);
  assert.equal(created.message.sender_type, 'SYSTEM');
});

async function withServer(run) {
  const localIdentityService = {
    async verifyAccessToken(token) {
      assert.equal(token, 'valid-token');
      return CLAIMS;
    },
  };
  const calls = [];
  const messagingService = {
    async listMessages(claims, conversationId, options) {
      calls.push(['list', claims, conversationId, options]);
      return { messages: [message()], page: { limit: 10, has_more: false, next_before_message_id: null } };
    },
    async sendHumanMessage(claims, conversationId, body) {
      calls.push(['send', claims, conversationId, body]);
      return { created: true, message: message({ body_text: body.body_text }) };
    },
    async getReadCursor(claims, conversationId) {
      calls.push(['getCursor', claims, conversationId]);
      return { read_cursor: null };
    },
    async advanceReadCursor(claims, conversationId, body) {
      calls.push(['putCursor', claims, conversationId, body]);
      return { read_cursor: { last_read_message_id: body.last_read_message_id } };
    },
  };

  const server = http.createServer(createRequestHandler({ localIdentityService, messagingService }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    await run(`http://127.0.0.1:${port}`, calls);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('P1-V5 HTTP routes authenticate and expose history/send/read cursor APIs', async () => {
  await withServer(async (baseUrl, calls) => {
    const headers = { authorization: 'Bearer valid-token', 'content-type': 'application/json' };
    const conversationId = message().conversation_id;

    let response = await fetch(`${baseUrl}/api/v1/conversations/${conversationId}/messages?limit=10` , { headers });
    assert.equal(response.status, 200);

    response = await fetch(`${baseUrl}/api/v1/conversations/${conversationId}/messages`, {
      method: 'POST', headers, body: JSON.stringify({ body_text: 'hello', client_message_id: 'client-1' }),
    });
    assert.equal(response.status, 201);

    response = await fetch(`${baseUrl}/api/v1/conversations/${conversationId}/read-cursor`, { headers });
    assert.equal(response.status, 200);

    response = await fetch(`${baseUrl}/api/v1/conversations/${conversationId}/read-cursor`, {
      method: 'PUT', headers, body: JSON.stringify({ last_read_message_id: message().message_id }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(calls.map((call) => call[0]), ['list', 'send', 'getCursor', 'putCursor']);
  });
});

test('P1-V5 verification preserves human idempotency and adds SystemSender event idempotency', () => {
  const migration = fs.readFileSync(path.join(__dirname, '..', 'database', 'migrations', '202609012115__p1_v5_durable_messaging.sql'), 'utf8');
  const verification = fs.readFileSync(path.join(__dirname, '..', 'database', 'verification', 'verify_p1_v5_durable_messaging.sql'), 'utf8');
  assert.match(verification, /uq_ac_message_client_id/);
  assert.match(verification, /fk_ac_message_reply/);
  assert.match(verification, /fk_ac_read_cursor_message/);
  assert.match(migration, /uq_ac_message_system_source_event/);
  assert.match(migration, /system_sender_id[\s\S]*source_event_id/);
});

test('active web client sends/loads messages but has no realtime transport before P1-V6', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'apps', 'web', 'src', 'App.jsx'), 'utf8');
  const api = fs.readFileSync(path.join(__dirname, '..', 'apps', 'web', 'src', 'api.js'), 'utf8');
  assert.match(app, /sendMessage/);
  assert.match(app, /listMessages/);
  assert.match(app, /Refresh/);
  assert.match(app, /Enter to send · Shift\+Enter for new line/);
  assert.match(app, /event\.key === 'Enter' && !event\.shiftKey/);
  assert.match(app, /form\?\.requestSubmit/);
  assert.match(api, /\/messages/);
  assert.match(api, /\/read-cursor/);
  assert.doesNotMatch(app + api, /WebSocket|EventSource|socket\.io/i);
});

test('repository SQL keeps channel/DM access scoped and read cursor monotonic', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'services', 'api', 'src', 'messaging', 'messagingRepository.js'), 'utf8');
  assert.match(source, /ch\.visibility = 'PUBLIC' OR cm\.workspace_member_id IS NOT NULL/);
  assert.match(source, /conversation_type IN \('DM', 'GROUP_DM'\)[\s\S]*cp\.workspace_member_id IS NOT NULL/);
  assert.match(source, /ON CONFLICT \(workspace_id, conversation_id, workspace_member_id\)/);
  assert.match(source, /current_message\.created_at[\s\S]*candidate_message\.created_at/);
});

test('messaging core contains no AkshaERP module/function/table contract', () => {
  const repositorySource = fs.readFileSync(path.join(__dirname, '..', 'services', 'api', 'src', 'messaging', 'messagingRepository.js'), 'utf8');
  const serviceSource = fs.readFileSync(path.join(__dirname, '..', 'services', 'api', 'src', 'messaging', 'messagingService.js'), 'utf8');
  const combined = repositorySource + serviceSource;
  assert.doesNotMatch(combined, /sec_effective_user_actions|sec_graphql_operation_mappings|module_code|function_code|akshaerp\./i);
});
