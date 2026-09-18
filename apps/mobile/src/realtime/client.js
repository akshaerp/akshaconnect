/* global globalThis:readonly */
import { normalizeBaseUrl } from '../api/client.js';

const BASE_RECONNECT_DELAY_MS = 500;
const MAX_RECONNECT_DELAY_MS = 5000;

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
  let reconnectAttempt = 0;

  function status(value) {
    onStatus?.(value);
  }

  function scheduleReconnect() {
    if (stopped || reconnectTimer) return;

    const delay = Math.min(
      MAX_RECONNECT_DELAY_MS,
      BASE_RECONNECT_DELAY_MS * (2 ** Math.min(reconnectAttempt, 4))
    );

    reconnectAttempt += 1;
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
        status('connected');
      }

      onEvent?.(payload);
    };

    nextSocket.onclose = () => {
      if (socket === nextSocket) {
        socket = null;
      }

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

    stopped = true;

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
    url,
  });
}

export {
  BASE_RECONNECT_DELAY_MS,
  MAX_RECONNECT_DELAY_MS,
};
