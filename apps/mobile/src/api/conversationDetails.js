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

function conversationPath(conversationId, suffix) {
  return (
    `/api/v1/conversations/${encodeURIComponent(
      conversationId
    )}/${suffix}`
  );
}

export function getConversationDetails(
  baseUrl,
  token,
  conversationId
) {
  return request(
    baseUrl,
    conversationPath(
      conversationId,
      'details'
    ),
    { token }
  );
}

export function updateChannelProfile(
  baseUrl,
  token,
  conversationId,
  {
    channelName,
    description,
    topic,
  }
) {
  return request(
    baseUrl,
    conversationPath(
      conversationId,
      'channel-profile'
    ),
    {
      token,
      method: 'PUT',
      body: {
        channel_name: channelName,
        description,
        topic,
      },
    }
  );
}

export function replaceChannelRules(
  baseUrl,
  token,
  conversationId,
  rules
) {
  return request(
    baseUrl,
    conversationPath(
      conversationId,
      'channel-rules'
    ),
    {
      token,
      method: 'PUT',
      body: { rules },
    }
  );
}

export function listConversationPeople(
  baseUrl,
  token,
  conversationId
) {
  return request(
    baseUrl,
    conversationPath(
      conversationId,
      'channel-members'
    ),
    { token }
  );
}

export function addConversationPerson(
  baseUrl,
  token,
  conversationId,
  workspaceMemberId
) {
  return request(
    baseUrl,
    conversationPath(
      conversationId,
      'channel-members'
    ),
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

export function removeConversationPerson(
  baseUrl,
  token,
  conversationId,
  workspaceMemberId
) {
  return request(
    baseUrl,
    conversationPath(
      conversationId,
      `channel-members/${encodeURIComponent(
        workspaceMemberId
      )}`
    ),
    {
      token,
      method: 'DELETE',
    }
  );
}

export function listConversationShared(
  baseUrl,
  token,
  conversationId,
  kind
) {
  return request(
    baseUrl,
    conversationPath(
      conversationId,
      `shared?kind=${encodeURIComponent(
        kind
      )}`
    ),
    { token }
  );
}

export function listConversationPins(
  baseUrl,
  token,
  conversationId
) {
  return request(
    baseUrl,
    conversationPath(
      conversationId,
      'pins'
    ),
    { token }
  );
}

export function pinConversationMessage(
  baseUrl,
  token,
  conversationId,
  messageId
) {
  return request(
    baseUrl,
    conversationPath(
      conversationId,
      `pins/${encodeURIComponent(
        messageId
      )}`
    ),
    {
      token,
      method: 'PUT',
    }
  );
}

export function unpinConversationMessage(
  baseUrl,
  token,
  conversationId,
  messageId
) {
  return request(
    baseUrl,
    conversationPath(
      conversationId,
      `pins/${encodeURIComponent(
        messageId
      )}`
    ),
    {
      token,
      method: 'DELETE',
    }
  );
}

export function getConversationSetting(
  baseUrl,
  token,
  conversationId
) {
  return request(
    baseUrl,
    conversationPath(
      conversationId,
      'settings'
    ),
    { token }
  );
}

export function updateConversationSetting(
  baseUrl,
  token,
  conversationId,
  {
    notificationLevel,
    mutedUntil = null,
  }
) {
  return request(
    baseUrl,
    conversationPath(
      conversationId,
      'settings'
    ),
    {
      token,
      method: 'PUT',
      body: {
        notification_level:
          notificationLevel,
        muted_until:
          mutedUntil,
      },
    }
  );
}
