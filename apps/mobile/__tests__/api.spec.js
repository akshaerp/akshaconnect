import {
  listMessages,
  normalizeBaseUrl,
  sendMessage,
} from '../src/api/client.js';

describe('AkshaConnect mobile API origin', () => {
  test('normalizes a configured server origin', () => {
    expect(normalizeBaseUrl('https://connect.example.com/')).toBe(
      'https://connect.example.com'
    );
  });

  test('requires an explicit HTTP or HTTPS origin', () => {
    expect(() => normalizeBaseUrl('connect.example.com')).toThrow(
      'Server URL must start with http:// or https://'
    );
  });

  test('does not silently default to localhost', () => {
    expect(() => normalizeBaseUrl('')).toThrow(
      'Enter the AkshaConnect server URL'
    );
  });
});

describe('AkshaConnect mobile durable messaging API', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('loads a bounded conversation history page', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          messages: [],
          page: {
            limit: 50,
            has_more: false,
            next_before_message_id: null,
          },
        }),
    });

    await listMessages(
      'https://connect.example.com',
      'token-1',
      'conversation-1',
      { limit: 50 }
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://connect.example.com/api/v1/conversations/' +
        'conversation-1/messages?limit=50'
    );
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe(
      'Bearer token-1'
    );
  });

  test('sends text with a client id and no sender authority', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 201,
      text: async () =>
        JSON.stringify({
          created: true,
          message: { message_id: 'message-1' },
        }),
    });

    await sendMessage(
      'https://connect.example.com',
      'token-1',
      'conversation-1',
      {
        bodyText: 'Hello from Android',
        clientMessageId: 'mobile-client-1',
      }
    );

    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body);

    expect(options.method).toBe('POST');
    expect(body.body_text).toBe('Hello from Android');
    expect(body.client_message_id).toBe('mobile-client-1');
    expect(body.reply_to_message_id).toBeNull();
    expect(body.sender_member_id).toBeUndefined();
    expect(body.workspace_id).toBeUndefined();
  });
});
