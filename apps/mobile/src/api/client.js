export class ApiError extends Error {
  constructor(message, status = 0, code = 'REQUEST_FAILED') {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code || 'REQUEST_FAILED';
  }
}

export function normalizeBaseUrl(value) {
  const normalized = String(value || '').trim().replace(/\/+$/, '');
  if (!normalized) {
    throw new ApiError(
      'Enter the AkshaConnect server URL',
      0,
      'SERVER_URL_REQUIRED'
    );
  }
  if (!/^https?:\/\//i.test(normalized)) {
    throw new ApiError(
      'Server URL must start with http:// or https://',
      0,
      'SERVER_URL_INVALID'
    );
  }
  return normalized;
}

async function parseJsonResponse(response) {
  const text = await response.text();
  let payload = {};

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ApiError(
        'The server returned an invalid response',
        response.status,
        'RESPONSE_INVALID'
      );
    }
  }

  if (!response.ok) {
    throw new ApiError(
      payload?.error?.message || `Request failed (${response.status})`,
      response.status,
      payload?.error?.code || 'REQUEST_FAILED'
    );
  }

  return payload;
}

async function request(
  baseUrl,
  path,
  { token = '', method = 'GET', body, signal } = {}
) {
  const root = normalizeBaseUrl(baseUrl);
  const headers = { accept: 'application/json' };

  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';

  let response;

  try {
    response = await fetch(`${root}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    throw new ApiError(
      error?.message || 'Could not reach the AkshaConnect server',
      0,
      'NETWORK_ERROR'
    );
  }

  return parseJsonResponse(response);
}

export function loginLocal(
  baseUrl,
  { workspaceCode, loginName, password }
) {
  return request(baseUrl, '/api/v1/auth/local/login', {
    method: 'POST',
    body: {
      workspace_code: workspaceCode,
      login_name: loginName,
      password,
    },
  });
}

export function loginMobile(
  baseUrl,
  {
    workspaceCode,
    loginName,
    password,
    devicePlatform = 'ANDROID',
    deviceLabel = 'AkshaConnect Android',
  }
) {
  return request(
    baseUrl,
    '/api/v1/auth/mobile/login',
    {
      method: 'POST',
      body: {
        workspace_code: workspaceCode,
        login_name: loginName,
        password,
        device_platform: devicePlatform,
        device_label: deviceLabel,
      },
    }
  );
}

export function refreshMobile(
  baseUrl,
  deviceToken
) {
  return request(
    baseUrl,
    '/api/v1/auth/mobile/refresh',
    {
      method: 'POST',
      body: {
        device_token: deviceToken,
      },
    }
  );
}

export function logoutMobile(
  baseUrl,
  deviceToken
) {
  return request(
    baseUrl,
    '/api/v1/auth/mobile/logout',
    {
      method: 'POST',
      body: {
        device_token: deviceToken,
      },
    }
  );
}

export function logout(baseUrl, token) {
  return request(baseUrl, '/api/v1/auth/logout', {
    token,
    method: 'POST',
  });
}

export function listChannels(baseUrl, token) {
  return request(baseUrl, '/api/v1/channels', { token });
}

export function listDirectMessages(baseUrl, token) {
  return request(baseUrl, '/api/v1/direct-messages', { token });
}

export function listMessages(
  baseUrl,
  token,
  conversationId,
  { limit = 50, before = '' } = {}
) {
  let path =
    `/api/v1/conversations/${encodeURIComponent(conversationId)}` +
    `/messages?limit=${encodeURIComponent(String(limit))}`;

  if (before) {
    path += `&before=${encodeURIComponent(before)}`;
  }

  return request(baseUrl, path, { token });
}

export function sendMessage(
  baseUrl,
  token,
  conversationId,
  { bodyText, clientMessageId, replyToMessageId = null }
) {
  return request(
    baseUrl,
    `/api/v1/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      token,
      method: 'POST',
      body: {
        body_text: bodyText,
        client_message_id: clientMessageId,
        reply_to_message_id: replyToMessageId,
      },
    }
  );
}

export function listUnreadCounts(baseUrl, token) {
  return request(baseUrl, '/api/v1/unread-counts', { token });
}

export function markRead(
  baseUrl,
  token,
  conversationId,
  lastReadMessageId
) {
  return request(
    baseUrl,
    `/api/v1/conversations/${encodeURIComponent(conversationId)}/read-cursor`,
    {
      token,
      method: 'PUT',
      body: {
        last_read_message_id: lastReadMessageId,
      },
    }
  );
}


export function registerPush(
  baseUrl,
  token,
  {
    deviceToken,
    pushToken,
    platform = 'ANDROID',
  }
) {
  return request(
    baseUrl,
    '/api/v1/mobile/push/register',
    {
      token,
      method: 'POST',
      body: {
        device_token: deviceToken,
        provider: 'FCM',
        platform,
        push_token: pushToken,
      },
    }
  );
}

export function unregisterPush(
  baseUrl,
  token,
  {
    deviceToken,
    pushToken = '',
  }
) {
  return request(
    baseUrl,
    '/api/v1/mobile/push/unregister',
    {
      token,
      method: 'POST',
      body: {
        device_token: deviceToken,
        provider: 'FCM',
        push_token: pushToken || undefined,
      },
    }
  );
}
