
export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code || 'REQUEST_FAILED';
  }
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
      payload?.error?.message || 'Request failed',
      response.status,
      payload?.error?.code
    );
  }

  return payload;
}

async function request(path, { token = '', method = 'GET', body, signal } = {}) {
  const headers = {
    accept: 'application/json',
  };

  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';

  const response = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });

  return parseJsonResponse(response);
}

export function loginLocal({ workspaceCode, loginName, password }) {
  return request('/api/v1/auth/local/login', {
    method: 'POST',
    body: {
      workspace_code: workspaceCode,
      login_name: loginName,
      password,
    },
  });
}

export function inspectSession(token) {
  return request('/api/v1/auth/session', { token });
}

export function logout(token) {
  return request('/api/v1/auth/logout', { token, method: 'POST' });
}

export function listMembers(token, query = '') {
  const params = new URLSearchParams();
  if (query.trim()) params.set('query', query.trim());
  params.set('limit', '50');
  return request(`/api/v1/workspace/members?${params.toString()}`, { token });
}

export function listChannels(token) {
  return request('/api/v1/channels', { token });
}

export function createChannel(token, { channelName, visibility }) {
  return request('/api/v1/channels', {
    token,
    method: 'POST',
    body: {
      channel_name: channelName,
      visibility,
    },
  });
}

export function listDirectMessages(token) {
  return request('/api/v1/direct-messages', { token });
}

export function startDirectMessage(token, targetWorkspaceMemberId) {
  return request('/api/v1/direct-messages', {
    token,
    method: 'POST',
    body: {
      target_workspace_member_id: targetWorkspaceMemberId,
    },
  });
}

export function listMessages(token, conversationId, { limit = 50, before = '' } = {}) {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  if (before) params.set('before', before);
  return request(
    `/api/v1/conversations/${encodeURIComponent(conversationId)}/messages?${params.toString()}`,
    { token }
  );
}

export function sendMessage(
  token,
  conversationId,
  { bodyText, clientMessageId, replyToMessageId = null }
) {
  return request(`/api/v1/conversations/${encodeURIComponent(conversationId)}/messages`, {
    token,
    method: 'POST',
    body: {
      body_text: bodyText,
      client_message_id: clientMessageId,
      reply_to_message_id: replyToMessageId,
    },
  });
}

export async function uploadAttachment(
  token,
  conversationId,
  { file, clientMessageId }
) {
  if (!file) throw new TypeError('file is required');

  const response = await fetch(
    `/api/v1/conversations/${encodeURIComponent(conversationId)}/attachments`,
    {
      method: 'POST',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${token}`,
        'content-type': file.type || 'application/octet-stream',
        'x-akshaconnect-file-name': encodeURIComponent(file.name || 'attachment'),
        'x-client-message-id': clientMessageId,
      },
      body: file,
    }
  );

  return parseJsonResponse(response);
}

export async function downloadAttachment(token, conversationId, attachmentId) {
  const response = await fetch(
    `/api/v1/conversations/${encodeURIComponent(conversationId)}/attachments/${encodeURIComponent(attachmentId)}/content`,
    {
      headers: {
        accept: 'application/octet-stream',
        authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    await parseJsonResponse(response);
  }

  return response.blob();
}

export function getReadCursor(token, conversationId) {
  return request(
    `/api/v1/conversations/${encodeURIComponent(conversationId)}/read-cursor`,
    { token }
  );
}

export function markRead(token, conversationId, lastReadMessageId) {
  return request(
    `/api/v1/conversations/${encodeURIComponent(conversationId)}/read-cursor`,
    {
      token,
      method: 'PUT',
      body: { last_read_message_id: lastReadMessageId },
    }
  );
}

export function listUnreadCounts(token) {
  return request('/api/v1/unread-counts', { token });
}
