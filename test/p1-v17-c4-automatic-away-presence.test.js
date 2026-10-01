'use strict';

const assert =
  require('node:assert/strict');

const fs =
  require('node:fs');

const http =
  require('node:http');

const path =
  require('node:path');

const test =
  require('node:test');

const {
  EventEmitter,
} = require('node:events');

const {
  createPresenceRegistry,
} = require(
  '../services/api/src/realtime/presenceRegistry'
);

const {
  createRealtimeEventBus,
} = require(
  '../services/api/src/realtime/realtimeEventBus'
);

const {
  DEFAULT_WEB_PRESENCE_IDLE_MS,
  attachRealtimeGateway,
} = require(
  '../services/api/src/realtime/realtimeGateway'
);

const ROOT =
  path.resolve(
    __dirname,
    '..'
  );

function read(rel) {
  return fs.readFileSync(
    path.join(
      ROOT,
      rel
    ),
    'utf8'
  );
}

class FakeSocket extends EventEmitter {
  constructor() {
    super();
    this.readyState = 1;
    this.sent = [];
  }

  send(payload) {
    this.sent.push(
      JSON.parse(
        String(payload)
      )
    );
  }

  ping() {}

  close(code) {
    this.readyState = 3;
    this.emit(
      'close',
      code
    );
  }

  terminate() {
    this.readyState = 3;
    this.emit(
      'close',
      1006
    );
  }
}

class FakeWebSocketServer extends EventEmitter {
  constructor() {
    super();
    FakeWebSocketServer.instance =
      this;
  }

  handleUpgrade(
    req,
    socket,
    head,
    callback
  ) {
    callback(
      socket.fakeWebSocket
    );
  }

  close(callback) {
    callback?.();
  }
}

async function flushAsync() {
  await new Promise(
    (resolve) =>
      setImmediate(resolve)
  );

  await new Promise(
    (resolve) =>
      setImmediate(resolve)
  );
}

async function wait(ms) {
  await new Promise(
    (resolve) =>
      setTimeout(
        resolve,
        ms
      )
  );
}

async function waitForPresence({
  registry,
  workspaceId,
  memberId,
  expected,
  timeoutMs = 2000,
  pollMs = 20,
}) {
  const startedAt =
    Date.now();

  while (
    Date.now() -
      startedAt <
    timeoutMs
  ) {
    const actual =
      registry
        .getMemberPresence(
          workspaceId,
          memberId
        )
        .status;

    if (
      actual === expected
    ) {
      return actual;
    }

    await wait(
      pollMs
    );
  }

  return registry
    .getMemberPresence(
      workspaceId,
      memberId
    )
    .status;
}

function latestMemberPresence(
  socket,
  memberId
) {
  return [
    ...socket.sent,
  ]
    .reverse()
    .find(
      (payload) =>
        payload.type ===
          'presence.updated' &&
        payload.workspace_member_id ===
          memberId
    ) || null;
}

test(
  'V17-C4 server has a five-minute WEB inactivity safety net',
  () => {
    assert.equal(
      DEFAULT_WEB_PRESENCE_IDLE_MS,
      5 * 60 * 1000
    );

    const gateway =
      read(
        'services/api/src/realtime/realtimeGateway.js'
      );

    assert.match(
      gateway,
      /webPresenceIdleMs = DEFAULT_WEB_PRESENCE_IDLE_MS/
    );

    assert.match(
      gateway,
      /connection\.clientType === 'WEB'/
    );

    assert.match(
      gateway,
      /row\.state === 'ACTIVE'/
    );

    assert.match(
      gateway,
      /ageMs > webPresenceIdleMs/
    );

    assert.match(
      gateway,
      /state: 'AWAY'/
    );
  }
);

test(
  'V17-C4 idle WEB connection becomes Away server-side and real activity restores Online',
  async () => {
    const workspaceId =
      'workspace-c4';

    const aliceId =
      'member-alice';

    const bobId =
      'member-bob';

    const registry =
      createPresenceRegistry();

    const bus =
      createRealtimeEventBus();

    const server =
      http.createServer();

    const gateway =
      attachRealtimeGateway({
        server,
        localIdentityService: {
          async verifyAccessToken(
            token
          ) {
            return {
              workspace_id:
                workspaceId,
              workspace_member_id:
                token ===
                'alice-token'
                  ? aliceId
                  : bobId,
              identity_id:
                'identity-' +
                token,
            };
          },
        },
        messagingRepository: {
          async listConversationRecipientMemberIds() {
            return [
              aliceId,
              bobId,
            ];
          },
        },
        eventBus: bus,
        presenceRegistry:
          registry,
        heartbeatMs: 10000,
        mobilePresenceLeaseMs:
          60000,
        webPresenceIdleMs: 500,
        presenceSweepMs: 20,
        wsModule: {
          WebSocketServer:
            FakeWebSocketServer,
        },
      });

    const wss =
      FakeWebSocketServer.instance;

    const alice =
      new FakeSocket();

    const bob =
      new FakeSocket();

    wss.emit(
      'connection',
      alice,
      {}
    );

    wss.emit(
      'connection',
      bob,
      {}
    );

    alice.emit(
      'message',
      Buffer.from(
        JSON.stringify({
          type: 'auth',
          access_token:
            'alice-token',
          client_type: 'WEB',
        })
      )
    );

    bob.emit(
      'message',
      Buffer.from(
        JSON.stringify({
          type: 'auth',
          access_token:
            'bob-token',
          client_type: 'WEB',
        })
      )
    );

    await flushAsync();

    assert.equal(
      registry
        .getMemberPresence(
          workspaceId,
          aliceId
        )
        .status,
      'LIVE'
    );

    assert.equal(
      await waitForPresence({
        registry,
        workspaceId,
        memberId:
          aliceId,
        expected:
          'AWAY',
        timeoutMs:
          2000,
      }),
      'AWAY'
    );

    assert.equal(
      latestMemberPresence(
        bob,
        aliceId
      )?.status,
      'AWAY'
    );

    alice.emit(
      'message',
      Buffer.from(
        JSON.stringify({
          type:
            'presence.update',
          state: 'ACTIVE',
          active_conversation_id:
            null,
        })
      )
    );

    await flushAsync();

    assert.equal(
      await waitForPresence({
        registry,
        workspaceId,
        memberId:
          aliceId,
        expected:
          'LIVE',
        timeoutMs:
          250,
        pollMs:
          10,
      }),
      'LIVE'
    );

    assert.equal(
      latestMemberPresence(
        bob,
        aliceId
      )?.status,
      'LIVE'
    );

    alice.close(1000);

    await flushAsync();

    assert.equal(
      registry
        .getMemberPresence(
          workspaceId,
          aliceId
        )
        .status,
      'NOT_AVAILABLE'
    );

    assert.equal(
      latestMemberPresence(
        bob,
        aliceId
      )?.status,
      'NOT_AVAILABLE'
    );

    await gateway.close();
  }
);

test(
  'V17-C4 active mobile session still keeps aggregate presence Online when web is Away',
  () => {
    const registry =
      createPresenceRegistry();

    const workspaceId =
      'workspace-c4';

    const memberId =
      'member-mixed';

    registry.registerConnection({
      connectionId:
        'web-away',
      workspaceId,
      workspaceMemberId:
        memberId,
      clientType: 'WEB',
      state: 'AWAY',
    });

    registry.registerConnection({
      connectionId:
        'mobile-active',
      workspaceId,
      workspaceMemberId:
        memberId,
      clientType: 'MOBILE',
      state: 'ACTIVE',
    });

    assert.equal(
      registry
        .getMemberPresence(
          workspaceId,
          memberId
        )
        .status,
      'LIVE'
    );

    registry.removeConnection(
      'mobile-active'
    );

    assert.equal(
      registry
        .getMemberPresence(
          workspaceId,
          memberId
        )
        .status,
      'AWAY'
    );

    registry.removeConnection(
      'web-away'
    );

    assert.equal(
      registry
        .getMemberPresence(
          workspaceId,
          memberId
        )
        .status,
      'NOT_AVAILABLE'
    );
  }
);

test(
  'V17-C4 web shows Online Away Offline language while retaining the client idle timer',
  () => {
    const app =
      read(
        'apps/web/src/App.jsx'
      );

    assert.match(
      app,
      /if \(status === 'LIVE'\) return 'Online'/
    );

    assert.match(
      app,
      /if \(status === 'AWAY'\) return 'Away'/
    );

    assert.match(
      app,
      /return 'Offline'/
    );

    assert.match(
      app,
      /PRESENCE_IDLE_MS = 5 \* 60 \* 1000/
    );

    assert.match(
      app,
      /publishPresence\(PRESENCE_AWAY\)/
    );

    assert.match(
      app,
      /markWebActivity/
    );
  }
);
