'use strict';

const { randomUUID } = require('node:crypto');

const DEFAULT_AUTH_TIMEOUT_MS = 5000;
const DEFAULT_HEARTBEAT_MS = 30000;
const MAX_CLIENT_PAYLOAD_BYTES = 16 * 1024;

function jsonSend(ws, payload) {
  if (ws.readyState !== 1) return false;
  ws.send(JSON.stringify(payload));
  return true;
}

function safeJson(raw) {
  if (Buffer.byteLength(raw) > MAX_CLIENT_PAYLOAD_BYTES) return null;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function closeSocket(ws, code, reason) {
  try {
    ws.close(code, reason);
  } catch {
    try { ws.terminate(); } catch {}
  }
}

function attachRealtimeGateway({
  server,
  localIdentityService,
  messagingRepository,
  eventBus,
  path = '/ws',
  authTimeoutMs = DEFAULT_AUTH_TIMEOUT_MS,
  heartbeatMs = DEFAULT_HEARTBEAT_MS,
  wsModule = null,
} = {}) {
  if (!server) throw new TypeError('HTTP server is required');
  if (!localIdentityService || typeof localIdentityService.verifyAccessToken !== 'function') {
    throw new TypeError('Identity service is required');
  }
  if (!messagingRepository || typeof messagingRepository.listConversationRecipientMemberIds !== 'function') {
    throw new TypeError('Messaging repository with realtime recipient resolution is required');
  }
  if (!eventBus || typeof eventBus.subscribe !== 'function') {
    throw new TypeError('Realtime event bus is required');
  }

  const websocketModule = wsModule || require('ws');
  const WebSocketServer = websocketModule.WebSocketServer;
  if (typeof WebSocketServer !== 'function') {
    throw new TypeError('WebSocket server implementation is required');
  }

  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_CLIENT_PAYLOAD_BYTES });
  const connections = new Set();

  function handleUpgrade(req, socket, head) {
    let url;
    try {
      url = new URL(req.url || '/', 'http://localhost');
    } catch {
      socket.destroy();
      return;
    }

    if (url.pathname !== path) {
      socket.destroy();
      return;
    }

    // Authentication is intentionally not accepted from the URL. Browser clients
    // send the bearer token in the first WebSocket frame after the upgrade.
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  }

  server.on('upgrade', handleUpgrade);

  wss.on('connection', (ws) => {
    const connection = {
      connectionId: randomUUID(),
      ws,
      authenticated: false,
      claims: null,
      alive: true,
    };
    connections.add(connection);

    const authTimer = setTimeout(() => {
      if (!connection.authenticated) closeSocket(ws, 4401, 'Authentication required');
    }, authTimeoutMs);
    authTimer.unref?.();

    ws.on('pong', () => {
      connection.alive = true;
    });

    ws.on('message', async (raw) => {
      const message = safeJson(raw);
      if (!message) {
        closeSocket(ws, 4400, 'Invalid message');
        return;
      }

      if (!connection.authenticated) {
        if (message.type !== 'auth' || typeof message.access_token !== 'string') {
          closeSocket(ws, 4401, 'Authentication required');
          return;
        }

        try {
          const claims = await localIdentityService.verifyAccessToken(message.access_token);
          connection.claims = claims;
          connection.authenticated = true;
          clearTimeout(authTimer);
          jsonSend(ws, {
            type: 'ready',
            connection_id: connection.connectionId,
            workspace_id: claims.workspace_id,
            workspace_member_id: claims.workspace_member_id,
            server_time: new Date().toISOString(),
          });
        } catch {
          closeSocket(ws, 4401, 'Session invalid');
        }
        return;
      }

      if (message.type === 'ping') {
        jsonSend(ws, { type: 'pong', server_time: new Date().toISOString() });
      }
    });

    ws.on('close', () => {
      clearTimeout(authTimer);
      connections.delete(connection);
    });

    ws.on('error', () => {
      // close/error cleanup is handled by the socket lifecycle.
    });
  });

  const unsubscribe = eventBus.subscribe(async (event) => {
    if (event.type === 'message.created') {
      const recipientMemberIds = await messagingRepository.listConversationRecipientMemberIds({
        workspaceId: event.workspace_id,
        conversationId: event.conversation_id,
      });
      const allowed = new Set(recipientMemberIds || []);
      const payload = {
        type: 'message.created',
        conversation_id: event.conversation_id,
        message: event.message,
      };

      for (const connection of connections) {
        if (!connection.authenticated || !connection.claims) continue;
        if (connection.claims.workspace_id !== event.workspace_id) continue;
        if (!allowed.has(connection.claims.workspace_member_id)) continue;
        jsonSend(connection.ws, payload);
      }
      return;
    }

    if (event.type === 'read_cursor.updated') {
      const payload = {
        type: 'read_cursor.updated',
        conversation_id: event.conversation_id,
        last_read_message_id: event.last_read_message_id,
        read_at: event.read_at,
      };

      for (const connection of connections) {
        if (!connection.authenticated || !connection.claims) continue;
        if (connection.claims.workspace_id !== event.workspace_id) continue;
        if (connection.claims.workspace_member_id !== event.workspace_member_id) continue;
        jsonSend(connection.ws, payload);
      }
    }
  });

  const heartbeat = setInterval(() => {
    for (const connection of connections) {
      if (!connection.authenticated) continue;
      if (!connection.alive) {
        try { connection.ws.terminate(); } catch {}
        continue;
      }
      connection.alive = false;
      try { connection.ws.ping(); } catch {}
    }
  }, heartbeatMs);
  heartbeat.unref?.();

  async function close() {
    clearInterval(heartbeat);
    unsubscribe();
    server.off('upgrade', handleUpgrade);
    for (const connection of [...connections]) {
      try { connection.ws.terminate(); } catch {}
    }
    await new Promise((resolve) => wss.close(() => resolve()));
  }

  return Object.freeze({ close, path });
}

module.exports = {
  DEFAULT_AUTH_TIMEOUT_MS,
  DEFAULT_HEARTBEAT_MS,
  MAX_CLIENT_PAYLOAD_BYTES,
  attachRealtimeGateway,
};
