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

  let response;

  try {
    response = await fetch(path, {
      method,
      headers,
      body:
        body === undefined
          ? undefined
          : JSON.stringify(body),
    });
  } catch (error) {
    throw new ApiError(
      error?.message || 'Network request failed',
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
  return `/api/v1/conversations/${encodeURIComponent(
    conversationId
  )}/${suffix}`;
}

export function getConversationDetails(token, conversationId) {
  return request(
    conversationPath(conversationId, 'details'),
    { token }
  );
}

export function updateChannelProfile(
  token,
  conversationId,
  {
    channelName,
    description,
    topic,
  }
) {
  return request(
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
  token,
  conversationId,
  rules
) {
  return request(
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
  token,
  conversationId
) {
  return request(
    conversationPath(
      conversationId,
      'channel-members'
    ),
    { token }
  );
}

export function addConversationPerson(
  token,
  conversationId,
  workspaceMemberId
) {
  return request(
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
  token,
  conversationId,
  workspaceMemberId
) {
  return request(
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

export function searchConversationPeople(
  token,
  query
) {
  const params = new URLSearchParams();
  if (query) params.set('query', query);
  params.set('limit', '50');

  return request(
    `/api/v1/workspace/members?${params.toString()}`,
    { token }
  );
}

export function listConversationShared(
  token,
  conversationId,
  kind
) {
  return request(
    conversationPath(
      conversationId,
      `shared?kind=${encodeURIComponent(kind)}`
    ),
    { token }
  );
}

export function listConversationPins(
  token,
  conversationId
) {
  return request(
    conversationPath(
      conversationId,
      'pins'
    ),
    { token }
  );
}

export function pinConversationMessage(
  token,
  conversationId,
  messageId
) {
  return request(
    conversationPath(
      conversationId,
      `pins/${encodeURIComponent(messageId)}`
    ),
    {
      token,
      method: 'PUT',
    }
  );
}

export function unpinConversationMessage(
  token,
  conversationId,
  messageId
) {
  return request(
    conversationPath(
      conversationId,
      `pins/${encodeURIComponent(messageId)}`
    ),
    {
      token,
      method: 'DELETE',
    }
  );
}

export function updateConversationSetting(
  token,
  conversationId,
  notificationLevel
) {
  return request(
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
      },
    }
  );
}

export async function openSharedAttachment(
  token,
  conversationId,
  attachment
) {
  const response = await fetch(
    `/api/v1/conversations/${encodeURIComponent(
      conversationId
    )}/attachments/${encodeURIComponent(
      attachment.attachment_id
    )}/content`,
    {
      headers: {
        authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    throw new ApiError(
      `Could not open attachment (${response.status})`,
      response.status,
      'ATTACHMENT_DOWNLOAD_FAILED'
    );
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 60_000);
}
