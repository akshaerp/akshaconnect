'use strict';

const { BoundaryError, boundaryError } = require('../core/boundaryError');

const MAX_JSON_BYTES = 32 * 1024;

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function normalizeAllowedOrigins(value) {
  return new Set(
    String(value || '')
      .split(',')
      .map((item) => clean(item).replace(/\/$/, ''))
      .filter(Boolean)
  );
}

function writeJson(res, statusCode, body, headers = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(payload);
}

async function readJson(req) {
  let total = 0;
  const chunks = [];

  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_JSON_BYTES) {
      throw boundaryError('REQUEST_BODY_TOO_LARGE', 'Request body is too large.', 413);
    }
    chunks.push(chunk);
  }

  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) return {};

  try {
    const body = JSON.parse(text);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('object required');
    return body;
  } catch {
    throw boundaryError('REQUEST_JSON_INVALID', 'Request body must be a JSON object.', 400);
  }
}

function requestMetadata(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return {
    userAgent: clean(req.headers['user-agent']) || null,
    clientIp: forwarded || req.socket?.remoteAddress || null,
  };
}

function createMobileAuthHttpHandler({ mobileAuthService, allowedErpOrigins = '' } = {}) {
  if (!mobileAuthService) throw new TypeError('Mobile auth service is required');

  const allowedOrigins = normalizeAllowedOrigins(allowedErpOrigins);
  const authorizePath = '/api/v1/auth/mobile/akshaerp/authorize';
  const routes = new Set([
    '/api/v1/auth/mobile/discover',
    '/api/v1/auth/mobile/akshaerp/start',
    authorizePath,
    '/api/v1/auth/mobile/exchange',
    '/api/v1/auth/mobile/refresh',
    '/api/v1/auth/mobile/logout',
  ]);

  function corsHeaders(req) {
    const origin = clean(req.headers.origin).replace(/\/$/, '');
    if (!origin || !allowedOrigins.has(origin)) return null;
    return {
      'access-control-allow-origin': origin,
      vary: 'Origin',
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type, accept',
    };
  }

  return async function mobileAuthHttpHandler(req, res) {
    const url = new URL(req.url || '/', 'http://localhost');
    if (!routes.has(url.pathname)) return false;

    try {
      if (url.pathname === authorizePath) {
        const headers = corsHeaders(req);
        if (!headers) {
          throw boundaryError('MOBILE_AUTH_ORIGIN_DENIED', 'ERP authorization origin is not allowed.', 403);
        }

        if (req.method === 'OPTIONS') {
          res.writeHead(204, { ...headers, 'cache-control': 'no-store' });
          res.end();
          return true;
        }

        if (req.method !== 'POST') {
          writeJson(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' } }, headers);
          return true;
        }

        const result = await mobileAuthService.authorizeAkshaErp(await readJson(req));
        writeJson(res, 200, result, headers);
        return true;
      }

      if (req.method !== 'POST') {
        writeJson(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' } });
        return true;
      }

      const body = await readJson(req);
      const metadata = requestMetadata(req);
      let result;

      switch (url.pathname) {
        case '/api/v1/auth/mobile/discover':
          result = await mobileAuthService.discover(body);
          break;
        case '/api/v1/auth/mobile/akshaerp/start':
          result = await mobileAuthService.startAkshaErp(body, metadata);
          break;
        case '/api/v1/auth/mobile/exchange':
          result = await mobileAuthService.exchange(body, metadata);
          break;
        case '/api/v1/auth/mobile/refresh':
          result = await mobileAuthService.refresh(body, metadata);
          break;
        case '/api/v1/auth/mobile/logout':
          result = await mobileAuthService.logout(body);
          break;
        default:
          return false;
      }

      writeJson(res, 200, result);
      return true;
    } catch (error) {
      if (error instanceof BoundaryError) {
        writeJson(res, error.statusCode, {
          error: { code: error.code, message: error.message },
        }, url.pathname === authorizePath ? (corsHeaders(req) || {}) : {});
        return true;
      }

      writeJson(res, 500, {
        error: { code: 'INTERNAL_ERROR', message: 'Request failed.' },
      }, url.pathname === authorizePath ? (corsHeaders(req) || {}) : {});
      return true;
    }
  };
}

module.exports = {
  createMobileAuthHttpHandler,
};
