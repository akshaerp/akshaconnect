'use strict';

const { BoundaryError, boundaryError } = require('../core/boundaryError');

const LAUNCHER_SESSION_PATH =
  '/api/v1/auth/akshaerp/launcher/session';
const LAUNCHER_UNREAD_PATH =
  '/api/v1/launcher/unread-counts';
const MAX_BODY_BYTES = 32 * 1024;

function clean(value) {
  return value === null || value === undefined
    ? ''
    : String(value).trim();
}

function parseAllowedOrigins(value) {
  return new Set(
    String(value || '')
      .split(',')
      .map((item) => item.trim().replace(/\/+$/, ''))
      .filter(Boolean)
  );
}

function requestOrigin(req) {
  return clean(req.headers.origin).replace(/\/+$/, '');
}

function corsHeaders(origin, {
  methods = 'GET, POST, OPTIONS',
  headers = 'authorization, content-type, accept',
} = {}) {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': methods,
    'access-control-allow-headers': headers,
    'access-control-max-age': '600',
    vary: 'Origin',
  };
}

function writeJson(res, statusCode, body, origin) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    ...corsHeaders(origin),
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store, max-age=0',
    pragma: 'no-cache',
  });
  res.end(payload);
}

function writeNoContent(res, origin) {
  res.writeHead(204, {
    ...corsHeaders(origin),
    'cache-control': 'no-store',
  });
  res.end();
}

function assertAllowedOrigin(req, allowedOrigins) {
  if (!allowedOrigins.size) {
    throw boundaryError(
      'AKSHAERP_LAUNCHER_ALLOWED_ORIGIN_REQUIRED',
      'AkshaERP launcher allowed origin is not configured.',
      500
    );
  }

  const origin = requestOrigin(req);
  if (!origin || !allowedOrigins.has(origin)) {
    throw boundaryError(
      'AKSHAERP_LAUNCHER_ORIGIN_DENIED',
      'AkshaERP launcher origin is not allowed.',
      403
    );
  }

  return origin;
}

async function readBody(req) {
  let total = 0;
  const chunks = [];

  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) {
      throw boundaryError(
        'AKSHAERP_LAUNCHER_BODY_TOO_LARGE',
        'AkshaERP launcher request is too large.',
        413
      );
    }
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString('utf8');
}

function parseBody(req, raw) {
  const contentType = String(
    req.headers['content-type'] || ''
  )
    .split(';')[0]
    .trim()
    .toLowerCase();

  if (
    !contentType ||
    contentType === 'application/x-www-form-urlencoded'
  ) {
    return Object.fromEntries(new URLSearchParams(raw || ''));
  }

  if (contentType === 'application/json') {
    try {
      const parsed = JSON.parse(raw || '{}');
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        Array.isArray(parsed)
      ) {
        throw new Error('object required');
      }
      return parsed;
    } catch {
      throw boundaryError(
        'AKSHAERP_LAUNCHER_REQUEST_INVALID',
        'AkshaERP launcher JSON request is invalid.',
        400
      );
    }
  }

  throw boundaryError(
    'AKSHAERP_LAUNCHER_CONTENT_TYPE_INVALID',
    'AkshaERP launcher requires form-urlencoded or JSON content.',
    415
  );
}

function bearerToken(req) {
  const value = clean(req.headers.authorization);
  const match = /^Bearer\s+(.+)$/i.exec(value);
  return match ? match[1].trim() : '';
}

function requestMetadata(req) {
  const forwarded = String(
    req.headers['x-forwarded-for'] || ''
  )
    .split(',')[0]
    .trim();

  return {
    userAgent:
      clean(req.headers['user-agent']) || null,
    clientIp:
      forwarded ||
      req.socket?.remoteAddress ||
      null,
  };
}

function totalUnread(rows = []) {
  return rows.reduce(
    (total, row) =>
      total + Number(row?.unread_count || 0),
    0
  );
}

function createTrustedErpBridgeHttpHandler({
  identityProvider,
  ssoService = null,
  identityService,
  messagingService,
  allowedOrigins = '',
} = {}) {
  const provider = String(
    identityProvider || 'LOCAL'
  ).trim().toUpperCase();
  const allowed = parseAllowedOrigins(allowedOrigins);

  if (
    !identityService ||
    typeof identityService.verifyAccessToken !== 'function'
  ) {
    throw new TypeError('An identity service is required');
  }

  if (
    !messagingService ||
    typeof messagingService.listUnreadCounts !== 'function'
  ) {
    throw new TypeError('A messaging service is required');
  }

  return async function trustedErpBridgeHttpHandler(req, res) {
    let url;
    try {
      url = new URL(req.url || '/', 'http://localhost');
    } catch {
      return false;
    }

    if (
      url.pathname !== LAUNCHER_SESSION_PATH &&
      url.pathname !== LAUNCHER_UNREAD_PATH
    ) {
      return false;
    }

    let origin = '';

    try {
      origin = assertAllowedOrigin(req, allowed);

      if (req.method === 'OPTIONS') {
        writeNoContent(res, origin);
        return true;
      }

      if (url.pathname === LAUNCHER_SESSION_PATH) {
        if (req.method !== 'POST') {
          throw boundaryError(
            'METHOD_NOT_ALLOWED',
            'POST is required.',
            405
          );
        }

        if (
          provider !== 'AKSHAERP' ||
          !ssoService ||
          typeof ssoService.loginFromErpToken !== 'function'
        ) {
          throw boundaryError(
            'AKSHAERP_LAUNCHER_NOT_CONFIGURED',
            'AkshaERP launcher integration is not configured.',
            503
          );
        }

        const raw = await readBody(req);
        const body = parseBody(req, raw);
        const erpAccessToken = clean(
          body.erp_access_token ??
          body.erpAccessToken
        );

        const result = await ssoService.loginFromErpToken(
          erpAccessToken,
          requestMetadata(req)
        );

        writeJson(res, 200, {
          access_token: result.access_token,
          token_type: result.token_type,
          expires_at: result.expires_at,
          session_id: result.session_id,
          identity: result.identity,
          workspace: result.workspace,
          membership: result.membership,
        }, origin);

        return true;
      }

      if (req.method !== 'GET') {
        throw boundaryError(
          'METHOD_NOT_ALLOWED',
          'GET is required.',
          405
        );
      }

      const claims = await identityService.verifyAccessToken(
        bearerToken(req)
      );
      const payload = await messagingService.listUnreadCounts(
        claims
      );
      const unreadCounts = Array.isArray(payload?.unread_counts)
        ? payload.unread_counts
        : [];

      writeJson(res, 200, {
        unread_counts: unreadCounts,
        total_unread: totalUnread(unreadCounts),
      }, origin);

      return true;
    } catch (error) {
      const statusCode = error instanceof BoundaryError
        ? error.statusCode
        : 500;

      const publicError = error instanceof BoundaryError
        ? error
        : boundaryError(
            'AKSHAERP_LAUNCHER_FAILED',
            'AkshaConnect launcher integration failed.',
            500
          );

      // When the origin itself is denied there must be no permissive CORS
      // response. For an already-approved origin, preserve CORS on errors so
      // the ERP client can safely refresh/re-authenticate.
      if (origin) {
        writeJson(res, statusCode, {
          error: {
            code: publicError.code,
            message: publicError.message,
          },
        }, origin);
      } else {
        const payload = JSON.stringify({
          error: {
            code: publicError.code,
            message: publicError.message,
          },
        });
        res.writeHead(statusCode, {
          'content-type': 'application/json; charset=utf-8',
          'content-length': Buffer.byteLength(payload),
          'cache-control': 'no-store',
        });
        res.end(payload);
      }

      return true;
    }
  };
}

module.exports = {
  LAUNCHER_SESSION_PATH,
  LAUNCHER_UNREAD_PATH,
  parseAllowedOrigins,
  totalUnread,
  createTrustedErpBridgeHttpHandler,
};
