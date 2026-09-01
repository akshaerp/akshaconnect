export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code || 'REQUEST_FAILED';
  }
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

  const text = await response.text();
  let payload = {};

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ApiError('The server returned an invalid response', response.status, 'RESPONSE_INVALID');
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
