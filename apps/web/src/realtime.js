let notificationAudioContext = null;

function websocketUrl() {
  const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${window.location.host}/ws`;
}

export function unlockNotificationSound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return false;
    if (!notificationAudioContext) notificationAudioContext = new AudioContext();
    if (notificationAudioContext.state === 'suspended') {
      notificationAudioContext.resume().catch(() => {});
    }
    return true;
  } catch {
    return false;
  }
}

export function playIncomingMessageSound() {
  try {
    if (!unlockNotificationSound() || !notificationAudioContext) return false;
    const context = notificationAudioContext;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(720, now);
    oscillator.frequency.exponentialRampToValueAtTime(940, now + 0.08);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.11, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.17);
    return true;
  } catch {
    return false;
  }
}

export function createRealtimeClient({ token, onEvent, onStatus } = {}) {
  let socket = null;
  let stopped = false;
  let reconnectTimer = null;
  let reconnectAttempt = 0;

  function status(value) {
    onStatus?.(value);
  }

  function scheduleReconnect() {
    if (stopped || reconnectTimer) return;
    const delay = Math.min(5000, 500 * (2 ** Math.min(reconnectAttempt, 4)));
    reconnectAttempt += 1;
    status('reconnecting');
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  }

  function connect() {
    if (stopped || !token) return;
    status(reconnectAttempt ? 'reconnecting' : 'connecting');

    try {
      socket = new WebSocket(websocketUrl());
    } catch {
      scheduleReconnect();
      return;
    }

    socket.addEventListener('open', () => {
      // Never place the bearer token in the URL/query string. It is sent only
      // inside the first WebSocket frame after the transport is established.
      socket.send(JSON.stringify({ type: 'auth', access_token: token }));
    });

    socket.addEventListener('message', (event) => {
      let payload;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }
      if (!payload || typeof payload !== 'object') return;
      if (payload.type === 'ready') {
        reconnectAttempt = 0;
        status('connected');
      }
      onEvent?.(payload);
    });

    socket.addEventListener('close', () => {
      socket = null;
      if (!stopped) scheduleReconnect();
    });

    socket.addEventListener('error', () => {
      // The close event is the single reconnect trigger.
    });
  }

  function stop() {
    stopped = true;
    status('disconnected');
    if (reconnectTimer) window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
    if (socket) {
      try { socket.close(1000, 'Client shutdown'); } catch {}
    }
    socket = null;
  }

  connect();
  return Object.freeze({ stop });
}
