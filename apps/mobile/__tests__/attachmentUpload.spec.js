jest.mock('react-native-blob-util', () => {
  const fetch = jest.fn();
  const wrap = jest.fn(
    (value) => `wrapped:${value}`
  );

  return {
    __esModule: true,
    default: {
      fetch,
      wrap,
    },
  };
});

import ReactNativeBlobUtil from 'react-native-blob-util';

import {
  ApiError,
  uploadAttachment,
} from '../src/api/client.js';

describe('AkshaConnect native attachment upload', () => {
  beforeEach(() => {
    ReactNativeBlobUtil.fetch.mockReset();
    ReactNativeBlobUtil.wrap.mockClear();
  });

  test('uploads a local file as raw binary with the existing attachment headers', async () => {
    const response = {
      info: () => ({ status: 201 }),
      text: async () =>
        JSON.stringify({
          created: true,
          message: {
            message_id: 'message-a1',
            message_type: 'ATTACHMENT',
          },
        }),
    };

    const task = Promise.resolve(response);
    task.uploadProgress = jest.fn();

    ReactNativeBlobUtil.fetch.mockReturnValue(task);

    const result = await uploadAttachment(
      'https://connect.example.com/',
      'token-1',
      'conversation-1',
      {
        localPath:
          '/data/user/0/app/cache/file.pdf',
        fileName: 'guide.pdf',
        contentType: 'application/pdf',
        clientMessageId:
          'mobile-file-client-1',
        onProgress: jest.fn(),
      }
    );

    expect(ReactNativeBlobUtil.wrap).toHaveBeenCalledWith(
      '/data/user/0/app/cache/file.pdf'
    );

    const [
      method,
      url,
      headers,
      body,
    ] =
      ReactNativeBlobUtil.fetch.mock.calls[0];

    expect(method).toBe('POST');
    expect(url).toBe(
      'https://connect.example.com/api/v1/conversations/' +
        'conversation-1/attachments'
    );
    expect(headers.authorization).toBe(
      'Bearer token-1'
    );
    expect(headers['content-type']).toBe(
      'application/pdf'
    );
    expect(
      headers['x-akshaconnect-file-name']
    ).toBe('guide.pdf');
    expect(
      headers['x-client-message-id']
    ).toBe('mobile-file-client-1');
    expect(body).toBe(
      'wrapped:/data/user/0/app/cache/file.pdf'
    );
    expect(task.uploadProgress).toHaveBeenCalledTimes(1);
    expect(result.created).toBe(true);
    expect(result.message.message_id).toBe('message-a1');
  });

  test('surfaces server attachment errors as ApiError', async () => {
    const response = {
      info: () => ({ status: 415 }),
      text: async () =>
        JSON.stringify({
          error: {
            code: 'ATTACHMENT_CONTENT_MISMATCH',
            message:
              'Attachment content does not match the declared file type',
          },
        }),
    };

    const task = Promise.resolve(response);
    task.uploadProgress = jest.fn();

    ReactNativeBlobUtil.fetch.mockReturnValue(task);

    await expect(
      uploadAttachment(
        'https://connect.example.com',
        'token-1',
        'conversation-1',
        {
          localPath: '/tmp/file.pdf',
          fileName: 'file.pdf',
          contentType:
            'application/pdf',
          clientMessageId:
            'mobile-file-client-2',
        }
      )
    ).rejects.toMatchObject({
      name: 'ApiError',
      status: 415,
      code: 'ATTACHMENT_CONTENT_MISMATCH',
    });
  });

  test('rejects a missing local path before native upload', async () => {
    await expect(
      uploadAttachment(
        'https://connect.example.com',
        'token-1',
        'conversation-1',
        {
          localPath: '',
          fileName: 'file.pdf',
          contentType: 'application/pdf',
          clientMessageId:
            'mobile-file-client-3',
        }
      )
    ).rejects.toBeInstanceOf(ApiError);

    expect(
      ReactNativeBlobUtil.fetch
    ).not.toHaveBeenCalled();
  });
});
