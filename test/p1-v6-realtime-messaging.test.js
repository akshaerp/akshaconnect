'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');
const { EventEmitter } = require('node:events');
const { createRequestHandler } = require('../services/api/src/app');
const { createMessagingService } = require('../services/api/src/messaging/messagingService');
const { createRealtimeEventBus } = require('../services/api/src/realtime/realtimeEventBus');
const { attachRealtimeGateway } = require('../services/api/src/realtime/realtimeGateway');

const WORKSPACE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ALICE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
const BOB_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
const CONVERSATION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const ALICE_CLAIMS = Object.freeze({
  workspace_id: WORKSPACE_ID,
  workspace_member_id: ALICE_ID,
  identity_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddd01',
});

function humanMessage(overrides = {}) {
  return {
    message_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    conversation_id: CONVERSATION_ID,
    sender_type: 'HUMAN',
    sender_member_id: ALICE_ID,
    system_sender_id: null,
    message_type: 'TEXT',
    body_text: 'realtime hello',
    client_message_id: 'client-realtime-1',
    source_event_id: null,
    reply_to_message_id: null,
    sender_display_name: 'Alice Alpha',
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function serviceRepository(overrides = {}) {
  return {
    async getActiveWorkspaceMember() { return { workspace_member_id: ALICE_ID }; },
    async getConversationAccess() { return { conversation_id: CONVERSATION_ID, conversation_type: 'DM' }; },
    async getActiveConversation() { return { conversation_id: CONVERSATION_ID, conversation_type: 'DM' }; },
    async getMessageInConversation() { return humanMessage(); },
    async findHumanMessageByClientId() { return null; },
    async createHumanMessage(input) {
      return humanMessage({ body_text: input.bodyText, client_message_id: input.clientMessageId });
    },
    async listMessages() { return { rows: [], hasMore: false, nextBeforeMessageId: null, cursorInvalid: false }; },
    async getReadCursor() { return null; },
    async advanceReadCursor(input) {
      return {
        workspace_id: input.workspaceId,
        conversation_id: input.conversationId,
        workspace_member_id: input.workspaceMemberId,
        last_read_message_id: input.lastReadMessageId,
        read_at: new Date().toISOString(),
        advanced: true,
      };
    },
    async listUnreadCounts() { return [{ conversation_id: CONVERSATION_ID, unread_count: 3 }]; },
    async getActiveSystemSender() { return null; },
    async findSystemMessageBySourceEvent() { return null; },
    async createSystemMessage() { throw new Error('not used'); },
    ...overrides,
  };
}

class FakeSocket extends EventEmitter {
  constructor() {
    super();
    this.readyState = 1;
    this.sent = [];
    this.closeCode = null;
  }

  send(payload) {
    this.sent.push(JSON.parse(String(payload)));
  }

  ping() {}

  close(code) {
    this.closeCode = code;
    this.readyState = 3;
    this.emit('close', code);
  }

  terminate() {
    this.readyState = 3;
    this.emit('close', 1006);
  }
}

class FakeWebSocketServer extends EventEmitter {
  constructor() {
    super();
    FakeWebSocketServer.instance = this;
  }

  handleUpgrade(req, socket, head, callback) {
    callback(socket.fakeWebSocket);
  }

  close(callback) {
    callback?.();
  }
}

const FAKE_WS_MODULE = { WebSocketServer: FakeWebSocketServer };

function latestSent(socket, type) {
  return [...socket.sent].reverse().find((payload) => payload.type === type) || null;
}

async function flushAsync() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

test('realtime event bus isolates listeners and supports unsubscribe', async () => {
  const bus = createRealtimeEventBus();
  const events = [];
  const unsubscribe = bus.subscribe((event) => events.push(event.type));
  bus.publish({ type: 'message.created' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events, ['message.created']);
  unsubscribe();
  bus.publish({ type: 'read_cursor.updated' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events, ['message.created']);
});

test('durable message creation publishes realtime event only for a newly created row', async () => {
  const events = [];
  const publisher = { publish(event) { events.push(event); } };
  const service = createMessagingService(serviceRepository(), { eventPublisher: publisher });
  const result = await service.sendHumanMessage(ALICE_CLAIMS, CONVERSATION_ID, {
    body_text: 'realtime hello',
    client_message_id: 'client-realtime-1',
  });
  assert.equal(result.created, true);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'message.created');
  assert.equal(events[0].workspace_id, WORKSPACE_ID);
  assert.equal(events[0].conversation_id, CONVERSATION_ID);

  const existing = result.message;
  const idempotentService = createMessagingService(serviceRepository({
    async findHumanMessageByClientId() { return existing; },
  }), { eventPublisher: publisher });
  const duplicate = await idempotentService.sendHumanMessage(ALICE_CLAIMS, CONVERSATION_ID, {
    body_text: existing.body_text,
    client_message_id: existing.client_message_id,
  });
  assert.equal(duplicate.created, false);
  assert.equal(events.length, 1);
});

test('unread counts derive workspace/member scope only from verified claims', async () => {
  let captured;
  const service = createMessagingService(serviceRepository({
    async listUnreadCounts(input) {
      captured = input;
      return [{ conversation_id: CONVERSATION_ID, unread_count: '4' }];
    },
  }));
  const result = await service.listUnreadCounts(ALICE_CLAIMS);
  assert.deepEqual(captured, { workspaceId: WORKSPACE_ID, workspaceMemberId: ALICE_ID });
  assert.deepEqual(result.unread_counts, [{ conversation_id: CONVERSATION_ID, unread_count: 4 }]);
});

test('read-cursor advancement publishes same-member realtime reconciliation event', async () => {
  const events = [];
  const service = createMessagingService(serviceRepository(), {
    eventPublisher: { publish(event) { events.push(event); } },
  });
  await service.advanceReadCursor(ALICE_CLAIMS, CONVERSATION_ID, {
    last_read_message_id: humanMessage().message_id,
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'read_cursor.updated');
  assert.equal(events[0].workspace_member_id, ALICE_ID);
});

test('authenticated websocket fan-out reaches only resolved conversation recipients', async () => {
  const bus = createRealtimeEventBus();
  const server = http.createServer();
  const identity = {
    async verifyAccessToken(token) {
      if (token === 'alice-token') return ALICE_CLAIMS;
      if (token === 'bob-token') {
        return { ...ALICE_CLAIMS, workspace_member_id: BOB_ID, identity_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddd02' };
      }
      throw new Error('invalid');
    },
  };
  const repository = {
    async listConversationRecipientMemberIds() { return [ALICE_ID, BOB_ID]; },
  };
  const gateway = attachRealtimeGateway({
    server,
    localIdentityService: identity,
    messagingRepository: repository,
    eventBus: bus,
    heartbeatMs: 10000,
    wsModule: FAKE_WS_MODULE,
  });

  const wss = FakeWebSocketServer.instance;
  const alice = new FakeSocket();
  const bob = new FakeSocket();
  wss.emit('connection', alice, {});
  wss.emit('connection', bob, {});
  alice.emit('message', Buffer.from(JSON.stringify({ type: 'auth', access_token: 'alice-token' })));
  bob.emit('message', Buffer.from(JSON.stringify({ type: 'auth', access_token: 'bob-token' })));
  await flushAsync();

  assert.equal(latestSent(alice, 'ready').workspace_member_id, ALICE_ID);
  assert.equal(latestSent(bob, 'ready').workspace_member_id, BOB_ID);

  bus.publish({
    type: 'message.created',
    workspace_id: WORKSPACE_ID,
    conversation_id: CONVERSATION_ID,
    message: humanMessage(),
  });
  await flushAsync();

  assert.equal(latestSent(alice, 'message.created').message.body_text, 'realtime hello');
  assert.equal(latestSent(bob, 'message.created').conversation_id, CONVERSATION_ID);
  await gateway.close();
});

test('unread-count HTTP endpoint authenticates and returns trusted workspace counts', async () => {
  const localIdentityService = {
    async verifyAccessToken(token) {
      assert.equal(token, 'valid-token');
      return ALICE_CLAIMS;
    },
  };
  const messagingService = {
    async listUnreadCounts(claims) {
      assert.equal(claims.workspace_id, WORKSPACE_ID);
      return { unread_counts: [{ conversation_id: CONVERSATION_ID, unread_count: 2 }] };
    },
  };
  const server = http.createServer(createRequestHandler({ localIdentityService, messagingService }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/unread-counts`, {
      headers: { authorization: 'Bearer valid-token' },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      unread_counts: [{ conversation_id: CONVERSATION_ID, unread_count: 2 }],
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('websocket requires first-frame session auth and rejects invalid session', async () => {
  const bus = createRealtimeEventBus();
  const server = http.createServer();
  const gateway = attachRealtimeGateway({
    server,
    localIdentityService: { async verifyAccessToken() { throw new Error('invalid'); } },
    messagingRepository: { async listConversationRecipientMemberIds() { return []; } },
    eventBus: bus,
    heartbeatMs: 10000,
    wsModule: FAKE_WS_MODULE,
  });
  const socket = new FakeSocket();
  FakeWebSocketServer.instance.emit('connection', socket, {});
  socket.emit('message', Buffer.from(JSON.stringify({ type: 'auth', access_token: 'invalid-token' })));
  await flushAsync();
  assert.equal(socket.closeCode, 4401);
  await gateway.close();
});

test('repository unread SQL is access-scoped and does not count own human messages', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'services', 'api', 'src', 'messaging', 'messagingRepository.js'), 'utf8');
  assert.match(source, /listUnreadCounts/);
  assert.match(source, /ch\.visibility = 'PUBLIC' OR cm\.workspace_member_id IS NOT NULL/);
  assert.match(source, /m\.sender_member_id IS DISTINCT FROM \$2::uuid/);
  assert.match(source, /last_read_message_id/);
  assert.match(source, /listConversationRecipientMemberIds/);
  assert.match(source, /conv\.conversation_type IN \('DM', 'GROUP_DM'\)/);
});

test('browser websocket auth keeps bearer token out of URL and reconnects with durable reconciliation hooks', () => {
  const realtime = fs.readFileSync(path.join(__dirname, '..', 'apps', 'web', 'src', 'realtime.js'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '..', 'apps', 'web', 'src', 'App.jsx'), 'utf8');
  assert.match(realtime, /new WebSocket\(websocketUrl\(\)\)/);
  assert.match(realtime, /type: 'auth', access_token: token/);
  assert.doesNotMatch(realtime, /[?&](token|access_token)=/i);
  assert.match(realtime, /scheduleReconnect/);
  assert.match(app, /refreshUnreadCounts/);
  assert.match(app, /reconnectEpoch/);
});

test('incoming message UX has unread badges, sound and no self-notification sound', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'apps', 'web', 'src', 'App.jsx'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'apps', 'web', 'src', 'messages.css'), 'utf8');
  assert.match(app, /unread-badge/);
  assert.match(app, /playIncomingMessageSound\(\)/);
  assert.match(app, /if \(ownMessage\) return/);
  assert.match(app, /message-toast/);
  assert.match(css, /\.unread-badge/);
  assert.match(css, /\.message-toast/);
});

test('Vite proxies WebSocket upgrades, server pins current ws and P1-V6 remains provider-neutral', () => {
  const vite = fs.readFileSync(path.join(__dirname, '..', 'apps', 'web', 'vite.config.js'), 'utf8');
  const gateway = fs.readFileSync(path.join(__dirname, '..', 'services', 'api', 'src', 'realtime', 'realtimeGateway.js'), 'utf8');
  const bus = fs.readFileSync(path.join(__dirname, '..', 'services', 'api', 'src', 'realtime', 'realtimeEventBus.js'), 'utf8');
  const apiPackage = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'services', 'api', 'package.json'), 'utf8'));
  assert.match(vite, /'\/ws'[\s\S]*ws: true/);
  assert.equal(apiPackage.dependencies.ws, '8.21.3');
  assert.doesNotMatch(gateway + bus, /sec_effective_user_actions|module_code|function_code|akshaerp\./i);
});
