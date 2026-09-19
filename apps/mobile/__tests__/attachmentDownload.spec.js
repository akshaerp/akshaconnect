jest.mock('react-native-blob-util', () => {
  const configuredFetch = jest.fn();
  const config = jest.fn(() => ({
    fetch: configuredFetch,
  }));

  return {
    __esModule: true,
    default: {
      config,
      __configuredFetch: configuredFetch,
    },
  };
});

import ReactNativeBlobUtil from 'react-native-blob-util';

import {
  ApiError,
  downloadAttachmentToCache,
} from '../src/api/client.js';

describe('AkshaConnect attachment download cache', () => {
  beforeEach(() => {
    ReactNativeBlobUtil.config.mockClear();
    ReactNativeBlobUtil.__configuredFetch.mockReset();
  });

  test('downloads authorized attachment content into a native cache file', async () => {
    const response = {
      info: () => ({ status: 200 }),
      path: () =>
        '/data/user/0/app/cache/rn-blob-util-file.pdf',
      flush: jest.fn(),
    };

    ReactNativeBlobUtil.__configuredFetch.mockResolvedValue(
      response
    );

    const result =
      await downloadAttachmentToCache(
        'https://connect.example.com/',
        'token-1',
        'conversation-1',
        {
          attachment_id: 'attachment-1',
          file_name: 'report.pdf',
          content_type:
            'application/pdf',
        }
      );

    expect(
      ReactNativeBlobUtil.config
    ).toHaveBeenCalledWith({
      fileCache: true,
      appendExt: 'pdf',
    });

    expect(
      ReactNativeBlobUtil.__configuredFetch
    ).toHaveBeenCalledWith(
      'GET',
      'https://connect.example.com/api/v1/conversations/' +
        'conversation-1/attachments/attachment-1/content',
      {
        accept:
          'application/octet-stream',
        authorization:
          'Bearer token-1',
      }
    );

    expect(result).toEqual({
      attachmentId: 'attachment-1',
      fileName: 'report.pdf',
      contentType:
        'application/pdf',
      localPath:
        '/data/user/0/app/cache/rn-blob-util-file.pdf',
    });
  });

  test('surfaces rejected attachment download as ApiError', async () => {
    const response = {
      info: () => ({ status: 404 }),
      path: () => '/tmp/error.txt',
      flush: jest.fn(),
    };

    ReactNativeBlobUtil.__configuredFetch.mockResolvedValue(
      response
    );

    await expect(
      downloadAttachmentToCache(
        'https://connect.example.com',
        'token-1',
        'conversation-1',
        {
          attachment_id: 'missing',
          file_name: 'missing.pdf',
          content_type:
            'application/pdf',
        }
      )
    ).rejects.toBeInstanceOf(ApiError);

    expect(response.flush).toHaveBeenCalled();
  });

  test('rejects missing attachment id before native fetch', async () => {
    await expect(
      downloadAttachmentToCache(
        'https://connect.example.com',
        'token-1',
        'conversation-1',
        {}
      )
    ).rejects.toMatchObject({
      code: 'ATTACHMENT_ID_REQUIRED',
    });

    expect(
      ReactNativeBlobUtil.config
    ).not.toHaveBeenCalled();
  });
});
