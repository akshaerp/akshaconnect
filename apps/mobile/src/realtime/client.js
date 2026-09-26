/* global globalThis:readonly */
import { normalizeBaseUrl } from '../api/client.js';

const BASE_RECONNECT_DELAY_MS = 500;
const MAX_RECONNECT_DELAY_MS = 5000;
const PRESENCE_HEARTBEAT_MS = 10 * 1000;

const PRESENCE_ACTIVE = 'ACTIVE';
const PRESENCE_AWAY = 'AWAY';

export function websocketUrl(baseUrl) {
  const root = normalizeBaseUrl(baseUrl);

  if (/^https:\/\//i.test(root)) {
    return `wss://${root.slice('https://'.length)}/ws`;
  }

  return `ws://${root.slice('http://'.length)}/ws`;
}

function parseEventData(data) {
  if (typeof data !== 'string') return null;

  try {
    const payload = JSON.parse(data);
    return payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload
      : null;
  } catch {
    return null;
  }
}

export function createRealtimeClient({
  serverUrl,
  token,
  onEvent,
  onStatus,
  clientType = 'MOBILE',
  WebSocketImpl = globalThis.WebSocket,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  if (!token) {
    throw new TypeError('Realtime access token is required');
  }

  if (typeof WebSocketImpl !== 'function') {
    throw new TypeError('WebSocket implementation is unavailable');
  }

  const url = websocketUrl(serverUrl);

  let socket = null;
  let stopped = false;
  let reconnectTimer = null;
  let presenceHeartbeatTimer = null;
  let reconnectAttempt = 0;
  let ready = false;
  let latestPresence = {
    state: PRESENCE_ACTIVE,
    activeConversationId: null,
  };

  function status(value) {
    onStatus?.(value);
  }

  function sendPresence() {
    if (!ready || !socket || socket.readyState !== 1) return false;

    try {
      socket.send(
        JSON.stringify({
          type: 'presence.update',
          state: latestPresence.state,
          active_conversation_id:
            latestPresence.activeConversationId,
        })
      );
      return true;
    } catch {
      return false;
    }
  }

  function clearPresenceHeartbeat() {
    if (!presenceHeartbeatTimer) return;
    clearTimer(presenceHeartbeatTimer);
    presenceHeartbeatTimer = null;
  }

  function schedulePresenceHeartbeat() {
    if (stopped || !ready || presenceHeartbeatTimer) return;

    presenceHeartbeatTimer = setTimer(() => {
      presenceHeartbeatTimer = null;
      if (stopped || !ready) return;
      sendPresence();
      schedulePresenceHeartbeat();
    }, PRESENCE_HEARTBEAT_MS);
  }

  function leavePresence() {
    if (!ready || !socket || socket.readyState !== 1) return false;

    try {
      socket.send(JSON.stringify({ type: 'presence.leave' }));
      return true;
    } catch {
      return false;
    }
  }

  function updatePresence({
    state = PRESENCE_ACTIVE,
    activeConversationId = null,
  } = {}) {
    latestPresence = {
      state:
        state === PRESENCE_AWAY
          ? PRESENCE_AWAY
          : PRESENCE_ACTIVE,
      activeConversationId:
        state === PRESENCE_AWAY
          ? null
          : String(
              activeConversationId || ''
            ).trim() || null,
    };

    sendPresence();
  }

  function scheduleReconnect() {
    if (stopped || reconnectTimer) return;

    const delay = Math.min(
      MAX_RECONNECT_DELAY_MS,
      BASE_RECONNECT_DELAY_MS * (2 ** Math.min(reconnectAttempt, 4))
    );

    reconnectAttempt += 1;
    ready = false;
    status('reconnecting');

    reconnectTimer = setTimer(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  }

  function connect() {
    if (stopped) return;

    status(reconnectAttempt ? 'reconnecting' : 'connecting');

    let nextSocket;

    try {
      nextSocket = new WebSocketImpl(url);
    } catch {
      scheduleReconnect();
      return;
    }

    socket = nextSocket;

    nextSocket.onopen = () => {
      if (stopped || socket !== nextSocket) return;

      try {
        nextSocket.send(
          JSON.stringify({
            type: 'auth',
            access_token: token,
            client_type: clientType,
          })
        );
      } catch {
        try {
          nextSocket.close();
        } catch {
          scheduleReconnect();
        }
      }
    };

    nextSocket.onmessage = (event) => {
      if (stopped || socket !== nextSocket) return;

      const payload = parseEventData(event?.data);
      if (!payload) return;

      if (payload.type === 'ready') {
        reconnectAttempt = 0;
        ready = true;
        status('connected');
        sendPresence();
        schedulePresenceHeartbeat();
      }

      onEvent?.(payload);
    };

    nextSocket.onclose = () => {
      if (socket === nextSocket) {
        socket = null;
      }

      ready = false;
      clearPresenceHeartbeat();

      if (!stopped) {
        scheduleReconnect();
      }
    };

    nextSocket.onerror = () => {
      // The close event is the single reconnect trigger.
    };
  }

  function stop() {
    if (stopped) return;

    // Explicitly leave presence before closing. The server also expires a
    // MOBILE presence lease if Android suspends/kills JS before cleanup runs.
    leavePresence();

    stopped = true;
    ready = false;
    clearPresenceHeartbeat();

    if (reconnectTimer) {
      clearTimer(reconnectTimer);
      reconnectTimer = null;
    }

    const current = socket;
    socket = null;

    if (current) {
      try {
        current.close(1000, 'Client shutdown');
      } catch {
        // The transport is already unavailable.
      }
    }

    status('disconnected');
  }

  connect();

  return Object.freeze({
    stop,
    updatePresence,
    leavePresence,
    url,
  });
}

export {
  BASE_RECONNECT_DELAY_MS,
  MAX_RECONNECT_DELAY_MS,
  PRESENCE_HEARTBEAT_MS,
  PRESENCE_ACTIVE,
  PRESENCE_AWAY,
};
