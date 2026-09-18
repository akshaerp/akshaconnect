import {
  BASE_RECONNECT_DELAY_MS,
  createRealtimeClient,
  websocketUrl,
} from '../src/realtime/client.js';

class FakeWebSocket {
  static instances = [];

  constructor(url) {
    this.url = url;
    this.sent = [];
    this.closed = false;

    FakeWebSocket.instances.push(this);
  }

  send(value) {
    this.sent.push(value);
  }

  close(code, reason) {
    this.closed = true;
    this.closeCode = code;
    this.closeReason = reason;
  }

  open() {
    this.onopen?.();
  }

  message(payload) {
    this.onmessage?.({
      data: JSON.stringify(payload),
    });
  }

  serverClose() {
    this.onclose?.({
      code: 1006,
    });
  }
}

describe('AkshaConnect mobile realtime client', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
  });

  test('derives ws/wss /ws origin from configured HTTP server', () => {
    expect(
      websocketUrl('http://127.0.0.1:4100/')
    ).toBe('ws://127.0.0.1:4100/ws');

    expect(
      websocketUrl('https://connect.example.com')
    ).toBe('wss://connect.example.com/ws');
  });

  test('keeps bearer token out of URL and sends it only in first auth frame', () => {
    const token = 'opaque-session-token';

    createRealtimeClient({
      serverUrl: 'https://connect.example.com',
      token,
      WebSocketImpl: FakeWebSocket,
    });

    const socket = FakeWebSocket.instances[0];

    expect(socket.url).toBe(
      'wss://connect.example.com/ws'
    );
    expect(socket.url).not.toContain(token);
    expect(socket.sent).toHaveLength(0);

    socket.open();

    expect(socket.sent).toHaveLength(1);
    expect(JSON.parse(socket.sent[0])).toEqual({
      type: 'auth',
      access_token: token,
    });
  });

  test('reports connected on ready and forwards durable realtime events', () => {
    const statuses = [];
    const events = [];

    const client = createRealtimeClient({
      serverUrl: 'http://127.0.0.1:4100',
      token: 'token-1',
      WebSocketImpl: FakeWebSocket,
      onStatus: (status) => statuses.push(status),
      onEvent: (event) => events.push(event),
    });

    const socket = FakeWebSocket.instances[0];

    socket.open();

    socket.message({
      type: 'ready',
      connection_id: 'connection-1',
    });

    socket.message({
      type: 'message.created',
      conversation_id: 'conversation-1',
      message: {
        message_id: 'message-1',
        body_text: 'Realtime hello',
      },
    });

    expect(statuses).toEqual([
      'connecting',
      'connected',
    ]);

    expect(events).toHaveLength(2);
    expect(events[1].type).toBe(
      'message.created'
    );
    expect(events[1].message.message_id).toBe(
      'message-1'
    );

    client.stop();

    expect(statuses.at(-1)).toBe(
      'disconnected'
    );
    expect(socket.closed).toBe(true);
  });

  test('reconnects with bounded backoff after transport close', () => {
    const statuses = [];
    let scheduled = null;

    createRealtimeClient({
      serverUrl: 'http://127.0.0.1:4100',
      token: 'token-1',
      WebSocketImpl: FakeWebSocket,
      onStatus: (status) => statuses.push(status),
      setTimer: (callback, delay) => {
        scheduled = {
          callback,
          delay,
        };
        return 1;
      },
      clearTimer: () => {},
    });

    const first = FakeWebSocket.instances[0];

    first.open();
    first.message({ type: 'ready' });
    first.serverClose();

    expect(statuses.at(-1)).toBe(
      'reconnecting'
    );
    expect(scheduled.delay).toBe(
      BASE_RECONNECT_DELAY_MS
    );

    scheduled.callback();

    expect(
      FakeWebSocket.instances
    ).toHaveLength(2);

    const second = FakeWebSocket.instances[1];

    second.open();
    second.message({ type: 'ready' });

    expect(statuses.at(-1)).toBe(
      'connected'
    );
  });
});
