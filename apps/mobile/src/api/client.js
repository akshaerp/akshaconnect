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
    throw new ApiError('Enter the AkshaConnect server URL', 0, 'SERVER_URL_REQUIRED');
  }
  if (!/^https?:\/\//i.test(normalized)) {
    throw new ApiError('Server URL must start with http:// or https://', 0, 'SERVER_URL_INVALID');
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
      throw new ApiError('The server returned an invalid response', response.status, 'RESPONSE_INVALID');
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

async function request(baseUrl, path, { token = '', method = 'GET', body, signal } = {}) {
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


let workspaceBootstrapInflight = null;

async function loadWorkspaceBootstrap(baseUrl, token) {
  const root = normalizeBaseUrl(baseUrl);
  const key = `${root}
${String(token || '')}`;

  if (workspaceBootstrapInflight?.key === key) {
    return workspaceBootstrapInflight.promise;
  }

  const promise = request(root, '/api/v1/mobile/workspace-bootstrap', { token })
    .catch((error) => {
      // During a rolling server/app deployment an older API may not expose the
      // bootstrap endpoint yet. Preserve compatibility by falling back to the
      // existing individual endpoints instead of blocking startup.
      if (Number(error?.status) === 404) return null;
      throw error;
    })
    .finally(() => {
      if (workspaceBootstrapInflight?.promise === promise) {
        workspaceBootstrapInflight = null;
      }
    });

  workspaceBootstrapInflight = { key, promise };
  return promise;
}

export function getMobileAppVersionPolicy(baseUrl, platform = 'ANDROID') {
  return request(
    baseUrl,
    `/api/v1/mobile/app-version?platform=${encodeURIComponent(platform)}`
  );
}

export function discoverMobileOrganizations(baseUrl, email) {
  return request(baseUrl, '/api/v1/auth/mobile/discover', {
    method: 'POST',
    body: { email },
  });
}

export function startAkshaErpMobileAuth(
  baseUrl,
  {
    email,
    tenantId,
    providerCode = 'AKSHAERP',
    redirectUri = 'akshaconnect://auth/callback',
    devicePlatform = 'ANDROID',
    deviceLabel = 'AkshaConnect Mobile',
  }
) {
  return request(baseUrl, '/api/v1/auth/mobile/akshaerp/start', {
    method: 'POST',
    body: {
      email,
      tenant_id: tenantId,
      provider_code: providerCode,
      redirect_uri: redirectUri,
      device_platform: devicePlatform,
      device_label: deviceLabel,
    },
  });
}

export function exchangeMobileAuthorization(
  baseUrl,
  { requestId, code, state, exchangeSecret }
) {
  return request(baseUrl, '/api/v1/auth/mobile/exchange', {
    method: 'POST',
    body: {
      request_id: requestId,
      code,
      state,
      exchange_secret: exchangeSecret,
    },
  });
}

export function loginLocal(baseUrl, { workspaceCode, loginName, password }) {
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
  return request(baseUrl, '/api/v1/auth/mobile/login', {
    method: 'POST',
    body: {
      workspace_code: workspaceCode,
      login_name: loginName,
      password,
      device_platform: devicePlatform,
      device_label: deviceLabel,
    },
  });
}

export function refreshMobile(baseUrl, deviceToken) {
  return request(baseUrl, '/api/v1/auth/mobile/refresh', {
    method: 'POST',
    body: { device_token: deviceToken },
  });
}

export function logoutMobile(baseUrl, deviceToken) {
  return request(baseUrl, '/api/v1/auth/mobile/logout', {
    method: 'POST',
    body: { device_token: deviceToken },
  });
}

export function logout(baseUrl, token) {
  return request(baseUrl, '/api/v1/auth/logout', {
    token,
    method: 'POST',
  });
}

export function listWorkspaces(baseUrl, token) {
  return request(baseUrl, '/api/v1/auth/workspaces', { token });
}

export function switchWorkspace(baseUrl, token, workspaceId) {
  return request(baseUrl, '/api/v1/auth/workspace/switch', {
    token,
    method: 'POST',
    body: { workspace_id: workspaceId },
  });
}

export function listWorkspaceMembers(baseUrl, token, { query = '', limit = 50 } = {}) {
  const path =
    `/api/v1/workspace/members?query=${encodeURIComponent(query)}` +
    `&limit=${encodeURIComponent(String(limit))}`;
  return request(baseUrl, path, { token });
}

export function searchMentionCandidates(
  baseUrl,
  token,
  conversationId,
  { kind = 'MEMBER', query = '', limit = 10 } = {}
) {
  const path =
    `/api/v1/conversations/${encodeURIComponent(conversationId)}` +
    `/mention-candidates?kind=${encodeURIComponent(String(kind))}` +
    `&query=${encodeURIComponent(String(query || ''))}` +
    `&limit=${encodeURIComponent(String(limit))}`;
  return request(baseUrl, path, { token });
}

export function startDirectMessage(baseUrl, token, targetWorkspaceMemberId) {
  return request(baseUrl, '/api/v1/direct-messages', {
    token,
    method: 'POST',
    body: { target_workspace_member_id: targetWorkspaceMemberId },
  });
}

export async function listChannels(baseUrl, token) {
  const bootstrap = await loadWorkspaceBootstrap(baseUrl, token);
  if (bootstrap) {
    return { channels: bootstrap.channels || [] };
  }
  return request(baseUrl, '/api/v1/channels', { token });
}

export function createChannel(
  baseUrl,
  token,
  { channelName, visibility = 'PUBLIC' }
) {
  return request(baseUrl, '/api/v1/channels', {
    token,
    method: 'POST',
    body: {
      channel_name: channelName,
      visibility,
    },
  });
}

export async function listDirectMessages(baseUrl, token) {
  const bootstrap = await loadWorkspaceBootstrap(baseUrl, token);
  if (bootstrap) {
    return { direct_messages: bootstrap.direct_messages || [] };
  }
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

  if (before) path += `&before=${encodeURIComponent(before)}`;
  return request(baseUrl, path, { token });
}

export function listThread(
  baseUrl,
  token,
  conversationId,
  parentMessageId
) {
  return request(baseUrl,
    `/api/v1/conversations/${encodeURIComponent(conversationId)}` +
      `/messages/${encodeURIComponent(parentMessageId)}/thread`,
    { token }
  );
}

export function getThreadReadCursor(
  baseUrl,
  token,
  conversationId,
  parentMessageId
) {
  return request(
    baseUrl,
    `/api/v1/conversations/${encodeURIComponent(conversationId)}` +
      `/messages/${encodeURIComponent(parentMessageId)}/thread/read-cursor`,
    { token }
  );
}

export function markThreadRead(
  baseUrl,
  token,
  conversationId,
  parentMessageId,
  lastReadMessageId
) {
  return request(
    baseUrl,
    `/api/v1/conversations/${encodeURIComponent(conversationId)}` +
      `/messages/${encodeURIComponent(parentMessageId)}/thread/read-cursor`,
    {
      token,
      method: 'PUT',
      body: { last_read_message_id: lastReadMessageId },
    }
  );
}

export function sendMessage(
  baseUrl,
  token,
  conversationId,
  {
    bodyText,
    clientMessageId,
    replyToMessageId = null,
    quoteMessageId = null,
    mentions = [],
  }
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
        quote_message_id: quoteMessageId,
        mentions,
      },
    }
  );
}

function getNativeBlobUtil() {
  const loaded = require('react-native-blob-util');
  return loaded?.default || loaded;
}

function parseNativeJsonText(text, status) {
  let payload = {};

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ApiError('The server returned an invalid response', status, 'RESPONSE_INVALID');
    }
  }

  if (status < 200 || status >= 300) {
    throw new ApiError(
      payload?.error?.message || `Request failed (${status})`,
      status,
      payload?.error?.code || 'REQUEST_FAILED'
    );
  }

  return payload;
}

export async function uploadAttachment(
  baseUrl,
  token,
  conversationId,
  {
    localPath,
    fileName,
    contentType,
    clientMessageId,
    replyToMessageId = null,
    quoteMessageId = null,
    onProgress,
  }
) {
  const root = normalizeBaseUrl(baseUrl);
  const blobUtil = getNativeBlobUtil();

  if (!localPath) {
    throw new ApiError('Attachment local file is unavailable', 0, 'ATTACHMENT_LOCAL_FILE_REQUIRED');
  }

  try {
    const task = blobUtil.fetch(
      'POST',
      `${root}/api/v1/conversations/${encodeURIComponent(conversationId)}/attachments`,
      {
        accept: 'application/json',
        authorization: `Bearer ${token}`,
        'content-type': contentType,
        'x-akshaconnect-file-name': encodeURIComponent(fileName || 'attachment'),
        'x-client-message-id': clientMessageId,
        ...(replyToMessageId ? { 'x-reply-to-message-id': replyToMessageId } : {}),
        ...(quoteMessageId ? { 'x-quote-message-id': quoteMessageId } : {}),
      },
      blobUtil.wrap(localPath)
    );

    if (typeof onProgress === 'function' && typeof task?.uploadProgress === 'function') {
      task.uploadProgress({ count: 20 }, (written, total) => {
        const sent = Number(written || 0);
        const expected = Number(total || 0);
        onProgress(expected > 0 ? Math.max(0, Math.min(1, sent / expected)) : 0);
      });
    }

    const response = await task;
    const status = Number(response?.info?.()?.status || 0);
    const responseText = await response?.text?.();
    return parseNativeJsonText(String(responseText || ''), status);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(error?.message || 'Could not upload attachment', 0, 'NETWORK_ERROR');
  }
}

function attachmentCacheExtension(fileName, contentType) {
  const match = String(fileName || '').toLowerCase().match(/\.([a-z0-9]{1,10})$/);
  if (match?.[1]) return match[1];

  const byType = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'application/pdf': 'pdf',
    'text/plain': 'txt',
    'text/csv': 'csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  };

  return byType[String(contentType || '').split(';')[0].trim().toLowerCase()] || 'bin';
}

export async function downloadAttachmentToCache(
  baseUrl,
  token,
  conversationId,
  attachment
) {
  const root = normalizeBaseUrl(baseUrl);
  const blobUtil = getNativeBlobUtil();
  const attachmentId = String(attachment?.attachment_id || '').trim();

  if (!attachmentId) {
    throw new ApiError('Attachment id is required', 0, 'ATTACHMENT_ID_REQUIRED');
  }

  const contentType = String(attachment?.content_type || 'application/octet-stream');
  const fileName = String(attachment?.file_name || 'attachment');
  const extension = attachmentCacheExtension(fileName, contentType);

  try {
    const response = await blobUtil
      .config({ fileCache: true, appendExt: extension })
      .fetch(
        'GET',
        `${root}/api/v1/conversations/${encodeURIComponent(conversationId)}` +
          `/attachments/${encodeURIComponent(attachmentId)}/content`,
        {
          accept: 'application/octet-stream',
          authorization: `Bearer ${token}`,
        }
      );

    const status = Number(response?.info?.()?.status || 0);
    if (status < 200 || status >= 300) {
      try { response?.flush?.(); } catch {}
      throw new ApiError(
        `Could not download attachment (${status})`,
        status,
        'ATTACHMENT_DOWNLOAD_FAILED'
      );
    }

    const localPath = String(response?.path?.() || '');
    if (!localPath) {
      throw new ApiError('Downloaded attachment is unavailable', status, 'ATTACHMENT_LOCAL_FILE_MISSING');
    }

    return { attachmentId, fileName, contentType, localPath };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(error?.message || 'Could not download attachment', 0, 'NETWORK_ERROR');
  }
}

export function editMessage(
  baseUrl,
  token,
  conversationId,
  messageId,
  bodyText,
  mentions = undefined
) {
  return request(
    baseUrl,
    `/api/v1/conversations/${encodeURIComponent(conversationId)}` +
      `/messages/${encodeURIComponent(messageId)}`,
    {
      token,
      method: 'PUT',
      body: {
        body_text: bodyText,
        ...(Array.isArray(mentions) ? { mentions } : {}),
      },
    }
  );
}

export function deleteMessage(baseUrl, token, conversationId, messageId) {
  return request(
    baseUrl,
    `/api/v1/conversations/${encodeURIComponent(conversationId)}` +
      `/messages/${encodeURIComponent(messageId)}`,
    { token, method: 'DELETE' }
  );
}

export async function listUnreadCounts(baseUrl, token) {
  const bootstrap = await loadWorkspaceBootstrap(baseUrl, token);
  if (bootstrap) {
    return { unread_counts: bootstrap.unread_counts || [] };
  }
  return request(baseUrl, '/api/v1/unread-counts', { token });
}

export function markRead(baseUrl, token, conversationId, lastReadMessageId) {
  return request(
    baseUrl,
    `/api/v1/conversations/${encodeURIComponent(conversationId)}/read-cursor`,
    {
      token,
      method: 'PUT',
      body: { last_read_message_id: lastReadMessageId },
    }
  );
}

export function registerPush(
  baseUrl,
  token,
  { deviceToken, pushToken, platform = 'ANDROID' }
) {
  return request(baseUrl, '/api/v1/mobile/push/register', {
    token,
    method: 'POST',
    body: {
      device_token: deviceToken,
      provider: 'FCM',
      platform,
      push_token: pushToken,
    },
  });
}

export function unregisterPush(
  baseUrl,
  token,
  { deviceToken, pushToken = '' }
) {
  return request(baseUrl, '/api/v1/mobile/push/unregister', {
    token,
    method: 'POST',
    body: {
      device_token: deviceToken,
      provider: 'FCM',
      push_token: pushToken || undefined,
    },
  });
}

export function getOwnPresenceProfile(baseUrl, token) {
  return request(baseUrl, '/api/v1/presence/me', { token });
}

export function updateOwnPresenceProfile(
  baseUrl,
  token,
  { customStatus = '', statusExpiresAt = null } = {}
) {
  return request(baseUrl, '/api/v1/presence/me', {
    token,
    method: 'PUT',
    body: {
      custom_status: customStatus || null,
      status_expires_at: statusExpiresAt || null,
    },
  });
}

export function listPresenceProfiles(baseUrl, token, workspaceMemberIds = []) {
  const ids = [...new Set((workspaceMemberIds || []).filter(Boolean))];
  const path = `/api/v1/presence/members?ids=${encodeURIComponent(ids.join(','))}`;
  return request(baseUrl, path, { token });
}


export function searchConversationMessages(
  baseUrl,
  token,
  conversationId,
  { query = '', limit = 50 } = {}
) {
  const path =
    `/api/v1/conversations/${encodeURIComponent(conversationId)}` +
    `/search?query=${encodeURIComponent(String(query || '').trim())}` +
    `&limit=${encodeURIComponent(String(limit))}`;
  return request(baseUrl, path, { token });
}

export function toggleMessageReaction(
  baseUrl,
  token,
  conversationId,
  messageId,
  emoji
) {
  return request(
    baseUrl,
    `/api/v1/conversations/${encodeURIComponent(conversationId)}` +
      `/messages/${encodeURIComponent(messageId)}/reactions`,
    { token, method: 'PUT', body: { emoji } }
  );
}

export function listMessageReactionUsers(
  baseUrl,
  token,
  conversationId,
  messageId
) {
  return request(
    baseUrl,
    `/api/v1/conversations/${encodeURIComponent(conversationId)}` +
      `/messages/${encodeURIComponent(messageId)}/reactions`,
    { token }
  );
}
