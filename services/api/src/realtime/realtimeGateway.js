'use strict';

const { randomUUID } = require('node:crypto');
const {
  createPresenceRegistry,
  normalizeClientType,
  normalizePresenceState,
  PUBLIC_NOT_AVAILABLE,
} = require('./presenceRegistry');

const DEFAULT_AUTH_TIMEOUT_MS = 5000;
const DEFAULT_HEARTBEAT_MS = 30000;
const DEFAULT_MOBILE_PRESENCE_LEASE_MS = 25 * 1000;
const DEFAULT_PRESENCE_SWEEP_MS = 5 * 1000;
const MAX_CLIENT_PAYLOAD_BYTES = 16 * 1024;
const MAX_CONVERSATION_ID_CHARS = 160;

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

function clean(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function normalizeConversationId(value) {
  const conversationId = clean(value);
  if (!conversationId) return null;
  if (conversationId.length > MAX_CONVERSATION_ID_CHARS) return null;
  return conversationId;
}

function attachRealtimeGateway({
  server,
  localIdentityService,
  messagingRepository,
  eventBus,
  presenceRegistry = null,
  path = '/ws',
  authTimeoutMs = DEFAULT_AUTH_TIMEOUT_MS,
  heartbeatMs = DEFAULT_HEARTBEAT_MS,
  mobilePresenceLeaseMs = DEFAULT_MOBILE_PRESENCE_LEASE_MS,
  presenceSweepMs = DEFAULT_PRESENCE_SWEEP_MS,
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

  const registry = presenceRegistry || createPresenceRegistry();

  const websocketModule = wsModule || require('ws');
  const WebSocketServer = websocketModule.WebSocketServer;
  if (typeof WebSocketServer !== 'function') {
    throw new TypeError('WebSocket server implementation is required');
  }

  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_CLIENT_PAYLOAD_BYTES });
  const connections = new Set();

  function workspaceConnections(workspaceId) {
    return [...connections].filter(
      (connection) =>
        connection.authenticated &&
        connection.claims?.workspace_id === workspaceId
    );
  }

  function broadcastPresence(workspaceId, presence) {
    if (!workspaceId || !presence?.workspace_member_id) return;

    const payload = {
      type: 'presence.updated',
      workspace_member_id: presence.workspace_member_id,
      status: presence.status || PUBLIC_NOT_AVAILABLE,
      server_time: new Date().toISOString(),
    };

    for (const connection of workspaceConnections(workspaceId)) {
      jsonSend(connection.ws, payload);
    }
  }

  function registerPresence(
    connection,
    clientType,
    state = 'ACTIVE',
    activeConversationId = null
  ) {
    if (!connection.claims) return null;

    const normalizedClientType = normalizeClientType(clientType);
    const normalizedState = normalizePresenceState(state);
    const normalizedConversationId =
      normalizedState === 'ACTIVE'
        ? normalizeConversationId(activeConversationId)
        : null;

    const result = registry.registerConnection({
      connectionId: connection.connectionId,
      workspaceId: connection.claims.workspace_id,
      workspaceMemberId: connection.claims.workspace_member_id,
      clientType: normalizedClientType,
      state: normalizedState,
      activeConversationId: normalizedConversationId,
    });

    connection.presenceRegistered = true;
    connection.clientType = normalizedClientType;

    if (result?.changed) {
      broadcastPresence(
        connection.claims.workspace_id,
        result.presence
      );
    }

    return result;
  }

  function unregisterPresence(connection) {
    if (!connection.presenceRegistered || !connection.claims) return;

    const result = registry.removeConnection(connection.connectionId);
    connection.presenceRegistered = false;

    if (result?.changed) {
      broadcastPresence(
        connection.claims.workspace_id,
        result.presence
      );
    }
  }

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

    // Authentication is intentionally not accepted from the URL. Browser and
    // mobile clients send the bearer token in the first WebSocket frame.
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
      presenceRegistered: false,
      clientType: 'WEB',
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

          registerPresence(
            connection,
            normalizeClientType(message.client_type)
          );

          jsonSend(ws, {
            type: 'ready',
            connection_id: connection.connectionId,
            workspace_id: claims.workspace_id,
            workspace_member_id: claims.workspace_member_id,
            server_time: new Date().toISOString(),
          });

          jsonSend(ws, {
            type: 'presence.snapshot',
            members: registry.snapshot(claims.workspace_id),
            server_time: new Date().toISOString(),
          });
        } catch {
          closeSocket(ws, 4401, 'Session invalid');
        }
        return;
      }

      if (message.type === 'presence.update') {
        const state = normalizePresenceState(message.state);
        const activeConversationId =
          state === 'ACTIVE'
            ? normalizeConversationId(
              message.active_conversation_id ??
              message.activeConversationId
            )
            : null;

        const wasRegistered = connection.presenceRegistered;
        const result = wasRegistered
          ? registry.updateConnection(
            connection.connectionId,
            {
              state,
              activeConversationId,
            }
          )
          : registerPresence(
            connection,
            connection.clientType,
            state,
            activeConversationId
          );

        if (wasRegistered && result?.changed) {
          broadcastPresence(
            connection.claims.workspace_id,
            result.presence
          );
        }

        jsonSend(ws, {
          type: 'presence.ack',
          status: result?.presence?.status || PUBLIC_NOT_AVAILABLE,
          server_time: new Date().toISOString(),
        });
        return;
      }

      if (message.type === 'presence.leave') {
        unregisterPresence(connection);

        jsonSend(ws, {
          type: 'presence.ack',
          status: PUBLIC_NOT_AVAILABLE,
          server_time: new Date().toISOString(),
        });
        return;
      }

      if (message.type === 'ping') {
        jsonSend(ws, { type: 'pong', server_time: new Date().toISOString() });
      }
    });

    ws.on('close', () => {
      clearTimeout(authTimer);
      unregisterPresence(connection);
      connections.delete(connection);
    });

    ws.on('error', () => {
      // close/error cleanup is handled by the socket lifecycle.
    });
  });

  const unsubscribe = eventBus.subscribe(async (event) => {
    if (
      event.type === 'message.created' ||
      event.type === 'message.updated' ||
      event.type === 'message.deleted'
    ) {
      const recipientMemberIds = await messagingRepository.listConversationRecipientMemberIds({
        workspaceId: event.workspace_id,
        conversationId: event.conversation_id,
      });
      const allowed = new Set(recipientMemberIds || []);
      const payload = {
        type: event.type,
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

  const presenceSweep = setInterval(() => {
    const now = Date.now();

    for (const connection of connections) {
      if (
        !connection.authenticated ||
        !connection.presenceRegistered ||
        connection.clientType !== 'MOBILE'
      ) {
        continue;
      }

      const row = registry.getConnection(connection.connectionId);
      if (!row) {
        connection.presenceRegistered = false;
        continue;
      }

      if (now - Number(row.updatedAt || 0) > mobilePresenceLeaseMs) {
        unregisterPresence(connection);
      }
    }
  }, presenceSweepMs);
  presenceSweep.unref?.();

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
    clearInterval(presenceSweep);
    clearInterval(heartbeat);
    unsubscribe();
    server.off('upgrade', handleUpgrade);
    for (const connection of [...connections]) {
      unregisterPresence(connection);
      try { connection.ws.terminate(); } catch {}
    }
    await new Promise((resolve) => wss.close(() => resolve()));
  }

  return Object.freeze({
    close,
    path,
    presenceRegistry: registry,
  });
}

module.exports = {
  DEFAULT_AUTH_TIMEOUT_MS,
  DEFAULT_HEARTBEAT_MS,
  DEFAULT_MOBILE_PRESENCE_LEASE_MS,
  DEFAULT_PRESENCE_SWEEP_MS,
  MAX_CLIENT_PAYLOAD_BYTES,
  MAX_CONVERSATION_ID_CHARS,
  attachRealtimeGateway,
};
