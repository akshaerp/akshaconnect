import {
  ApiError,
  normalizeBaseUrl,
} from './client';

async function request(
  baseUrl,
  path,
  {
    token = '',
    method = 'GET',
    body,
  } = {}
) {
  const root = normalizeBaseUrl(baseUrl);
  const headers = {
    accept: 'application/json',
  };

  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  if (body !== undefined) {
    headers['content-type'] =
      'application/json';
  }

  let response;

  try {
    response = await fetch(
      `${root}${path}`,
      {
        method,
        headers,
        body:
          body === undefined
            ? undefined
            : JSON.stringify(body),
      }
    );
  } catch (error) {
    throw new ApiError(
      error?.message ||
        'Could not reach the AkshaConnect server',
      0,
      'NETWORK_ERROR'
    );
  }

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
  baseUrl,
  token,
  conversationId
) {
  return request(
    baseUrl,
    `/api/v1/conversations/${encodeURIComponent(
      conversationId
    )}/channel-members`,
    { token }
  );
}

export function addChannelMember(
  baseUrl,
  token,
  conversationId,
  workspaceMemberId
) {
  return request(
    baseUrl,
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
  baseUrl,
  token,
  conversationId,
  workspaceMemberId
) {
  return request(
    baseUrl,
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
