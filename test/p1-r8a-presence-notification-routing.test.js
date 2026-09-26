'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const http = require('node:http');
const { EventEmitter } = require('node:events');

const {
  createPresenceRegistry,
} = require('../services/api/src/realtime/presenceRegistry');
const {
  createPushDeliveryService,
} = require('../services/api/src/push/pushDeliveryService');
const {
  createRealtimeEventBus,
} = require('../services/api/src/realtime/realtimeEventBus');
const {
  attachRealtimeGateway,
} = require('../services/api/src/realtime/realtimeGateway');

const ROOT = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

class FakeSocket extends EventEmitter {
  constructor() {
    super();
    this.readyState = 1;
    this.sent = [];
  }

  send(payload) {
    this.sent.push(JSON.parse(String(payload)));
  }

  ping() {}

  close(code) {
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

function latestSent(socket, type) {
  return [...socket.sent]
    .reverse()
    .find((payload) => payload.type === type) || null;
}

async function flushAsync() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

test('R8A aggregates Live, Away and Not available across web/mobile connections', () => {
  const registry = createPresenceRegistry();
  const workspaceId = 'workspace-1';
  const memberId = 'member-1';

  assert.equal(
    registry.getMemberPresence(workspaceId, memberId).status,
    'NOT_AVAILABLE'
  );

  registry.registerConnection({
    connectionId: 'web-1',
    workspaceId,
    workspaceMemberId: memberId,
    clientType: 'WEB',
    state: 'AWAY',
  });

  assert.equal(
    registry.getMemberPresence(workspaceId, memberId).status,
    'AWAY'
  );

  registry.registerConnection({
    connectionId: 'mobile-1',
    workspaceId,
    workspaceMemberId: memberId,
    clientType: 'MOBILE',
    state: 'ACTIVE',
  });

  assert.equal(
    registry.getMemberPresence(workspaceId, memberId).status,
    'LIVE'
  );

  registry.removeConnection('mobile-1');

  assert.equal(
    registry.getMemberPresence(workspaceId, memberId).status,
    'AWAY'
  );

  registry.removeConnection('web-1');

  assert.equal(
    registry.getMemberPresence(workspaceId, memberId).status,
    'NOT_AVAILABLE'
  );
});

test('R8A active-conversation suppression requires an ACTIVE connection', () => {
  const registry = createPresenceRegistry();
  const workspaceId = 'workspace-1';
  const memberId = 'member-1';
  const conversationId = 'conversation-1';

  registry.registerConnection({
    connectionId: 'web-1',
    workspaceId,
    workspaceMemberId: memberId,
    clientType: 'WEB',
    state: 'ACTIVE',
    activeConversationId: conversationId,
  });

  assert.equal(
    registry.isActivelyReading({
      workspaceId,
      workspaceMemberId: memberId,
      conversationId,
    }),
    true
  );

  registry.updateConnection('web-1', {
    state: 'AWAY',
    activeConversationId: conversationId,
  });

  assert.equal(
    registry.isActivelyReading({
      workspaceId,
      workspaceMemberId: memberId,
      conversationId,
    }),
    false
  );
});

test('R8A push routing suppresses an actively-read conversation but still notifies other recipients', async () => {
  const workspaceId = 'workspace-1';
  const conversationId = 'conversation-1';
  const activeReader = 'member-active';
  const awayReader = 'member-away';

  const sent = [];
  let registrationMemberIds = null;

  const service = createPushDeliveryService({
    messagingRepository: {
      async listConversationRecipientMemberIds() {
        return [activeReader, awayReader];
      },
      async getActiveConversation() {
        return { conversation_type: 'DM' };
      },
    },
    pushRegistrationRepository: {
      async listActiveRegistrations({ workspaceMemberIds }) {
        registrationMemberIds = workspaceMemberIds;
        return workspaceMemberIds.map((memberId) => ({
          workspace_member_id: memberId,
          push_token: `token-${memberId}`,
        }));
      },
      async revokeTokens() {
        return 0;
      },
    },
    pushSender: {
      async send(payload) {
        sent.push(payload);
        return {
          attempted: payload.tokens.length,
          success_count: payload.tokens.length,
          failure_count: 0,
          invalid_tokens: [],
        };
      },
    },
    presenceRegistry: {
      isActivelyReading({ workspaceMemberId }) {
        return workspaceMemberId === activeReader;
      },
    },
  });

  const result = await service.publishMessage({
    workspaceId,
    conversationId,
    message: {
      message_id: 'message-1',
      sender_type: 'HUMAN',
      sender_display_name: 'Alice',
      body_text: 'Hello',
    },
  });

  assert.deepEqual(registrationMemberIds, [awayReader]);
  assert.deepEqual(sent[0].tokens, [`token-${awayReader}`]);
  assert.equal(result.attempted, 1);
});


test('R8A realtime gateway broadcasts aggregate presence transitions', async () => {
  const workspaceId = 'workspace-1';
  const aliceId = 'member-alice';
  const bobId = 'member-bob';
  const registry = createPresenceRegistry();
  const bus = createRealtimeEventBus();
  const server = http.createServer();

  const gateway = attachRealtimeGateway({
    server,
    localIdentityService: {
      async verifyAccessToken(token) {
        if (token === 'alice-token') {
          return {
            workspace_id: workspaceId,
            workspace_member_id: aliceId,
            identity_id: 'identity-alice',
          };
        }

        return {
          workspace_id: workspaceId,
          workspace_member_id: bobId,
          identity_id: 'identity-bob',
        };
      },
    },
    messagingRepository: {
      async listConversationRecipientMemberIds() {
        return [aliceId, bobId];
      },
    },
    eventBus: bus,
    presenceRegistry: registry,
    heartbeatMs: 10000,
    wsModule: {
      WebSocketServer: FakeWebSocketServer,
    },
  });

  const wss = FakeWebSocketServer.instance;
  const alice = new FakeSocket();
  const bob = new FakeSocket();

  wss.emit('connection', alice, {});
  wss.emit('connection', bob, {});

  alice.emit(
    'message',
    Buffer.from(JSON.stringify({
      type: 'auth',
      access_token: 'alice-token',
      client_type: 'WEB',
    }))
  );

  bob.emit(
    'message',
    Buffer.from(JSON.stringify({
      type: 'auth',
      access_token: 'bob-token',
      client_type: 'MOBILE',
    }))
  );

  await flushAsync();

  const snapshot = latestSent(bob, 'presence.snapshot');
  assert.equal(
    snapshot.members.find(
      (member) => member.workspace_member_id === aliceId
    ).status,
    'LIVE'
  );

  alice.emit(
    'message',
    Buffer.from(JSON.stringify({
      type: 'presence.update',
      state: 'AWAY',
      active_conversation_id: null,
    }))
  );

  await flushAsync();

  assert.equal(
    latestSent(bob, 'presence.updated').workspace_member_id,
    aliceId
  );
  assert.equal(
    latestSent(bob, 'presence.updated').status,
    'AWAY'
  );

  alice.close(1000);
  await flushAsync();

  assert.equal(
    latestSent(bob, 'presence.updated').status,
    'NOT_AVAILABLE'
  );

  await gateway.close();
});


test('R8A.1 mobile explicit leave removes presence without waiting for WebSocket close', async () => {
  const workspaceId = 'workspace-1';
  const aliceId = 'member-alice';
  const bobId = 'member-bob';
  const registry = createPresenceRegistry();
  const bus = createRealtimeEventBus();
  const server = http.createServer();

  const gateway = attachRealtimeGateway({
    server,
    localIdentityService: {
      async verifyAccessToken(token) {
        return {
          workspace_id: workspaceId,
          workspace_member_id: token === 'alice-token' ? aliceId : bobId,
          identity_id: `identity-${token}`,
        };
      },
    },
    messagingRepository: {
      async listConversationRecipientMemberIds() {
        return [aliceId, bobId];
      },
    },
    eventBus: bus,
    presenceRegistry: registry,
    heartbeatMs: 10000,
    mobilePresenceLeaseMs: 60000,
    presenceSweepMs: 60000,
    wsModule: {
      WebSocketServer: FakeWebSocketServer,
    },
  });

  const wss = FakeWebSocketServer.instance;
  const alice = new FakeSocket();
  const bob = new FakeSocket();

  wss.emit('connection', alice, {});
  wss.emit('connection', bob, {});

  alice.emit(
    'message',
    Buffer.from(JSON.stringify({
      type: 'auth',
      access_token: 'alice-token',
      client_type: 'MOBILE',
    }))
  );

  bob.emit(
    'message',
    Buffer.from(JSON.stringify({
      type: 'auth',
      access_token: 'bob-token',
      client_type: 'WEB',
    }))
  );

  await flushAsync();

  assert.equal(
    registry.getMemberPresence(workspaceId, aliceId).status,
    'LIVE'
  );

  alice.emit(
    'message',
    Buffer.from(JSON.stringify({
      type: 'presence.leave',
    }))
  );

  await flushAsync();

  assert.equal(
    registry.getMemberPresence(workspaceId, aliceId).status,
    'NOT_AVAILABLE'
  );
  assert.equal(
    latestSent(bob, 'presence.updated').workspace_member_id,
    aliceId
  );
  assert.equal(
    latestSent(bob, 'presence.updated').status,
    'NOT_AVAILABLE'
  );
  assert.equal(
    latestSent(alice, 'presence.ack').status,
    'NOT_AVAILABLE'
  );

  await gateway.close();
});

test('R8A server shares one ephemeral presence registry between realtime and push routing', () => {
  const source = read('services/api/src/server.js');

  assert.match(source, /createPresenceRegistry/);
  assert.match(source, /const presenceRegistry\s*=\s*createPresenceRegistry\(\)/);
  assert.match(
    source,
    /createPushDeliveryService\(\{[\s\S]*presenceRegistry/
  );
  assert.match(
    source,
    /attachRealtimeGateway\(\{[\s\S]*presenceRegistry/
  );
});

test('R8A realtime protocol carries client type, presence snapshots and presence updates', () => {
  const gateway = read('services/api/src/realtime/realtimeGateway.js');
  const mobile = read('apps/mobile/src/realtime/client.js');
  const web = read('apps/web/src/realtime.js');

  assert.match(gateway, /presence\.snapshot/);
  assert.match(gateway, /presence\.updated/);
  assert.match(gateway, /presence\.update/);
  assert.match(gateway, /active_conversation_id/);

  assert.match(mobile, /client_type:\s*clientType/);
  assert.match(mobile, /clientType\s*=\s*'MOBILE'/);
  assert.match(mobile, /updatePresence/);

  assert.match(web, /client_type:\s*clientType/);
  assert.match(web, /clientType\s*=\s*'WEB'/);
  assert.match(web, /updatePresence/);
});

test('R8A mobile foreground presence becomes Away after five minutes and background removes realtime presence', () => {
  const app = read('apps/mobile/App.jsx');

  assert.match(app, /PRESENCE_IDLE_MS\s*=\s*5\s*\*\s*60\s*\*\s*1000/);
  assert.match(app, /publishPresence\(PRESENCE_AWAY\)/);
  assert.match(app, /APP_BACKGROUND_GRACE_MS\s*=\s*2000/);
  assert.match(app, /stableAppActive/);
  assert.match(app, /if \(!stableAppActive\)\s*\{[\s\S]*setRealtimeStatus\('offline'\)/);
  assert.match(app, /return \(\) => \{[\s\S]*realtime\.stop\(\)/);
  assert.match(app, /presence\.snapshot/);
  assert.match(app, /presence\.updated/);
  assert.match(
    app,
    /presenceStateRef\.current === PRESENCE_ACTIVE[\s\S]*activeConversation\?\.conversationId === payload\.conversation_id/
  );
});

test('R8A mobile DM UI uses peer presence instead of calling local transport Live', () => {
  const home = read('apps/mobile/src/screens/HomeScreen.jsx');
  const conversation = read('apps/mobile/src/screens/ConversationScreen.jsx');

  assert.match(home, /presenceByMember/);
  assert.match(home, /Not available/);
  assert.match(home, /Away/);
  assert.match(home, /otherWorkspaceMemberId/);
  assert.match(home, /if \(status === 'connected'\) return 'Connected'/);

  assert.match(conversation, /peerPresenceStatus/);
  assert.match(conversation, /presenceLabel/);
  assert.match(conversation, /Not available/);
  assert.match(conversation, /onUserActivity/);
});

test('R8A browser uses OS notifications while hidden and suppresses notification when actively reading', () => {
  const app = read('apps/web/src/App.jsx');
  const realtime = read('apps/web/src/realtime.js');

  assert.match(realtime, /Notification\.requestPermission/);
  assert.match(realtime, /new window\.Notification/);
  assert.match(realtime, /notification\.onclick/);

  assert.match(app, /displayBrowserMessageNotification/);
  assert.match(app, /document\.visibilityState !== 'visible'/);
  assert.match(app, /if \(activeAndReadable\)\s*\{\s*return;\s*\}/);
  assert.match(app, /PRESENCE_IDLE_MS\s*=\s*5\s*\*\s*60\s*\*\s*1000/);
  assert.match(app, /presenceByMember/);
});

test('R8A.1 mobile presence has explicit leave plus a renewable foreground lease', () => {
  const gateway = read('services/api/src/realtime/realtimeGateway.js');
  const mobile = read('apps/mobile/src/realtime/client.js');

  assert.match(gateway, /DEFAULT_MOBILE_PRESENCE_LEASE_MS\s*=\s*25\s*\*\s*1000/);
  assert.match(gateway, /DEFAULT_PRESENCE_SWEEP_MS\s*=\s*5\s*\*\s*1000/);
  assert.match(gateway, /message\.type === 'presence\.leave'/);
  assert.match(gateway, /connection\.clientType !== 'MOBILE'/);
  assert.match(gateway, /unregisterPresence\(connection\)/);

  assert.match(mobile, /PRESENCE_HEARTBEAT_MS\s*=\s*10\s*\*\s*1000/);
  assert.match(mobile, /type:\s*'presence\.leave'/);
  assert.match(mobile, /schedulePresenceHeartbeat/);
  assert.match(mobile, /leavePresence\(\);[\s\S]*current\.close/);
});

test('R8A.3 web DM navigation shows explicit status text with a standalone ringless status dot', () => {
  const app = read('apps/web/src/App.jsx');
  const styles = read('apps/web/src/styles.css');

  assert.match(app, /dm-presence-label/);
  assert.match(app, /presenceLabel\(memberPresence\)/);
  assert.match(app, /className="dm-avatar-status"/);
  assert.match(styles, /\.dm-presence-label\.presence-live/);
  assert.match(styles, /\.dm-presence-label\.presence-away/);
  assert.match(styles, /\.dm-presence-label\.presence-not-available/);
  assert.match(
    styles,
    /\.presence-dot\s*\{[\s\S]*position:\s*static;[\s\S]*border:\s*0;[\s\S]*box-shadow:\s*none;/
  );
  assert.match(
    styles,
    /\.presence-dot\.presence-not-available\s*\{[\s\S]*background:\s*#94a3b8;/
  );
  assert.doesNotMatch(styles, /\.dm-avatar-presence\s*\{/);
});

test('R8A.2 Android release advances to versionCode 13', () => {
  const gradle = read('apps/mobile/android/app/build.gradle');
  assert.match(gradle, /versionCode 13/);
  assert.match(gradle, /versionName "0\.3\.0-v13"/);
});
