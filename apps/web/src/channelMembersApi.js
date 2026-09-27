import { ApiError } from './api.js';

async function request(
  path,
  {
    token = '',
    method = 'GET',
    body,
  } = {}
) {
  const headers = {
    accept: 'application/json',
  };

  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  if (body !== undefined) {
    headers['content-type'] = 'application/json';
  }

  const response = await fetch(path, {
    method,
    headers,
    body:
      body === undefined
        ? undefined
        : JSON.stringify(body),
  });

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
      payload?.error?.message ||
        `Request failed (${response.status})`,
      response.status,
      payload?.error?.code ||
        'REQUEST_FAILED'
    );
  }

  return payload;
}

export function listChannelMembers(
  token,
  conversationId
) {
  return request(
    `/api/v1/conversations/${encodeURIComponent(
      conversationId
    )}/channel-members`,
    { token }
  );
}

export function addChannelMember(
  token,
  conversationId,
  workspaceMemberId
) {
  return request(
    `/api/v1/conversations/${encodeURIComponent(
      conversationId
    )}/channel-members`,
    {
      token,
      method: 'POST',
      body: {
        workspace_member_id:
          workspaceMemberId,
      },
    }
  );
}

export function removeChannelMember(
  token,
  conversationId,
  workspaceMemberId
) {
  return request(
    `/api/v1/conversations/${encodeURIComponent(
      conversationId
    )}/channel-members/${encodeURIComponent(
      workspaceMemberId
    )}`,
    {
      token,
      method: 'DELETE',
    }
  );
}
