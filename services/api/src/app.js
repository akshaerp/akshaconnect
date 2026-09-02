'use strict';

const { BoundaryError, boundaryError } = require('./core/boundaryError');

const VERSION = '0.12.0-phase1';
const SERVICE_NAME = process.env.AKSHACONNECT_SERVICE_NAME || 'akshaconnect-api';
const MAX_JSON_BYTES = 32 * 1024;

function writeJson(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  });
  res.end(payload);
}

function bearerToken(req) {
  const value = String(req.headers.authorization || '').trim();
  const match = /^Bearer\s+(.+)$/i.exec(value);
  return match ? match[1].trim() : '';
}

async function readJson(req) {
  let total = 0;
  const chunks = [];

  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_JSON_BYTES) {
      throw boundaryError('REQUEST_BODY_TOO_LARGE', 'Request body is too large', 413);
    }
    chunks.push(chunk);
  }

  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) return {};

  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('object required');
    }
    return parsed;
  } catch {
    throw boundaryError('REQUEST_JSON_INVALID', 'Request body must be a JSON object', 400);
  }
}

function requestMetadata(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return {
    userAgent: String(req.headers['user-agent'] || '').trim() || null,
    clientIp: forwarded || req.socket?.remoteAddress || null,
  };
}

function createRequestHandler({
  localIdentityService = null,
  collaborationService = null,
  messagingService = null,
} = {}) {
  return async function requestHandler(req, res) {
    try {
      const url = new URL(req.url || '/', 'http://localhost');

      if (req.method === 'GET' && (url.pathname === '/health' || url.pathname === '/ready')) {
        writeJson(res, 200, {
          status: 'ok',
          service: SERVICE_NAME,
          phase: '1',
          checkpoint: 'P1-V6',
          version: VERSION,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const isLocalAuthRoute = (
        url.pathname === '/api/v1/auth/local/login' ||
        url.pathname === '/api/v1/auth/session' ||
        url.pathname === '/api/v1/auth/logout'
      );

      if (isLocalAuthRoute) {
        if (!localIdentityService) {
          throw boundaryError(
            'LOCAL_IDENTITY_NOT_CONFIGURED',
            'LOCAL identity service is not configured',
            503
          );
        }

        if (req.method === 'POST' && url.pathname === '/api/v1/auth/local/login') {
          const body = await readJson(req);
          const result = await localIdentityService.login(body, requestMetadata(req));
          writeJson(res, 200, result);
          return;
        }

        if (req.method === 'GET' && url.pathname === '/api/v1/auth/session') {
          const claims = await localIdentityService.verifyAccessToken(bearerToken(req));
          writeJson(res, 200, {
            authenticated: true,
            claims,
          });
          return;
        }

        if (req.method === 'POST' && url.pathname === '/api/v1/auth/logout') {
          const result = await localIdentityService.logout(bearerToken(req));
          writeJson(res, 200, result);
          return;
        }
      }

      const isCollaborationRoute = (
        url.pathname === '/api/v1/workspace/members' ||
        url.pathname === '/api/v1/channels' ||
        url.pathname === '/api/v1/direct-messages'
      );

      if (isCollaborationRoute) {
        if (!localIdentityService) {
          throw boundaryError(
            'LOCAL_IDENTITY_NOT_CONFIGURED',
            'LOCAL identity service is not configured',
            503
          );
        }

        if (!collaborationService) {
          throw boundaryError(
            'COLLABORATION_NOT_CONFIGURED',
            'Collaboration service is not configured',
            503
          );
        }

        const claims = await localIdentityService.verifyAccessToken(bearerToken(req));

        if (req.method === 'GET' && url.pathname === '/api/v1/workspace/members') {
          const members = await localIdentityService.searchUsers({
            workspace_id: claims.workspace_id,
            requester_member_id: claims.workspace_member_id,
            search_text: url.searchParams.get('query') || '',
            limit: url.searchParams.get('limit') || undefined,
          });

          writeJson(res, 200, { members });
          return;
        }

        if (req.method === 'GET' && url.pathname === '/api/v1/channels') {
          const channels = await collaborationService.listChannels(claims);
          writeJson(res, 200, { channels });
          return;
        }

        if (req.method === 'POST' && url.pathname === '/api/v1/channels') {
          const body = await readJson(req);
          const channel = await collaborationService.createChannel(claims, body);
          writeJson(res, 201, { channel });
          return;
        }

        if (req.method === 'GET' && url.pathname === '/api/v1/direct-messages') {
          const directMessages = await collaborationService.listDirectMessages(claims);
          writeJson(res, 200, { direct_messages: directMessages });
          return;
        }

        if (req.method === 'POST' && url.pathname === '/api/v1/direct-messages') {
          const body = await readJson(req);
          const directMessage = await collaborationService.startDirectMessage(claims, body);
          writeJson(res, directMessage.created ? 201 : 200, {
            direct_message: directMessage,
          });
          return;
        }
      }

      if (url.pathname === '/api/v1/unread-counts') {
        if (!localIdentityService) {
          throw boundaryError(
            'LOCAL_IDENTITY_NOT_CONFIGURED',
            'LOCAL identity service is not configured',
            503
          );
        }
        if (!messagingService) {
          throw boundaryError(
            'MESSAGING_NOT_CONFIGURED',
            'Messaging service is not configured',
            503
          );
        }

        const claims = await localIdentityService.verifyAccessToken(bearerToken(req));
        if (req.method === 'GET') {
          const result = await messagingService.listUnreadCounts(claims);
          writeJson(res, 200, result);
          return;
        }
      }

      const messageRoute = /^\/api\/v1\/conversations\/([^/]+)\/messages$/.exec(url.pathname);
      const readCursorRoute = /^\/api\/v1\/conversations\/([^/]+)\/read-cursor$/.exec(url.pathname);

      if (messageRoute || readCursorRoute) {
        if (!localIdentityService) {
          throw boundaryError(
            'LOCAL_IDENTITY_NOT_CONFIGURED',
            'LOCAL identity service is not configured',
            503
          );
        }
        if (!messagingService) {
          throw boundaryError(
            'MESSAGING_NOT_CONFIGURED',
            'Messaging service is not configured',
            503
          );
        }

        const claims = await localIdentityService.verifyAccessToken(bearerToken(req));
        const encodedConversationId = messageRoute?.[1] || readCursorRoute?.[1] || '';
        const conversationId = decodeURIComponent(encodedConversationId);

        if (messageRoute && req.method === 'GET') {
          const result = await messagingService.listMessages(claims, conversationId, {
            limit: url.searchParams.get('limit') || undefined,
            before_message_id: url.searchParams.get('before') || undefined,
          });
          writeJson(res, 200, result);
          return;
        }

        if (messageRoute && req.method === 'POST') {
          const body = await readJson(req);
          const result = await messagingService.sendHumanMessage(claims, conversationId, body);
          writeJson(res, result.created ? 201 : 200, result);
          return;
        }

        if (readCursorRoute && req.method === 'GET') {
          const result = await messagingService.getReadCursor(claims, conversationId);
          writeJson(res, 200, result);
          return;
        }

        if (readCursorRoute && req.method === 'PUT') {
          const body = await readJson(req);
          const result = await messagingService.advanceReadCursor(claims, conversationId, body);
          writeJson(res, 200, result);
          return;
        }
      }

      writeJson(res, 404, {
        status: 'not_found',
        service: SERVICE_NAME,
      });
    } catch (error) {
      if (error instanceof BoundaryError) {
        writeJson(res, error.statusCode, {
          error: {
            code: error.code,
            message: error.message,
          },
        });
        return;
      }

      writeJson(res, 500, {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Request failed',
        },
      });
    }
  };
}

module.exports = {
  VERSION,
  SERVICE_NAME,
  MAX_JSON_BYTES,
  createRequestHandler,
};
