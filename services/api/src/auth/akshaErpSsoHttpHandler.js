'use strict';

const crypto = require('node:crypto');
const { BoundaryError, boundaryError } = require('../core/boundaryError');

const MAX_SSO_BODY_BYTES = 32 * 1024;
const SSO_PATH = '/api/v1/auth/akshaerp/sso';

const LOCAL_ONLY_AUTH_PATHS = new Set([
  '/api/v1/auth/local/login',
  '/api/v1/auth/mobile/login',
  '/api/v1/auth/mobile/refresh',
  '/api/v1/auth/mobile/logout',
  '/api/v1/auth/local/password',
]);

function writeJson(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  });
  res.end(payload);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeJsonForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function writeBootstrapHtml(res, loginResult, returnPath = '/') {
  const nonce = crypto.randomBytes(18).toString('base64url');
  const snapshot = {
    access_token: loginResult.access_token,
    expires_at: loginResult.expires_at,
    session_id: loginResult.session_id,
    identity: loginResult.identity,
    tenant: loginResult.tenant || null,
    workspace: loginResult.workspace,
    membership: loginResult.membership,
    workspaces: Array.isArray(loginResult.workspaces) ? loginResult.workspaces : [],
  };
  const payload = safeJsonForScript(snapshot);
  const target = safeJsonForScript(returnPath);

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="referrer" content="no-referrer">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Opening AkshaConnect</title>
</head>
<body>
<noscript>JavaScript is required to finish AkshaConnect sign-in.</noscript>
<script nonce="${nonce}">
(function () {
  var snapshot = ${payload};
  window.sessionStorage.setItem('akshaconnect.local-session.v1', JSON.stringify(snapshot));
  window.location.replace(${target});
})();
</script>
</body>
</html>`;

  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'content-length': Buffer.byteLength(html),
    'cache-control': 'no-store, max-age=0',
    pragma: 'no-cache',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'content-security-policy':
      `default-src 'none'; script-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`,
  });
  res.end(html);
}

function writeErrorHtml(res, statusCode, error) {
  const code = escapeHtml(error?.code || 'SSO_FAILED');
  const message = escapeHtml(error?.message || 'AkshaConnect sign-in failed.');
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="referrer" content="no-referrer">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AkshaConnect sign-in failed</title>
</head>
<body>
<h1>AkshaConnect sign-in failed</h1>
<p>${message}</p>
<p>Code: ${code}</p>
<p>Return to AkshaERP and try again.</p>
</body>
</html>`;

  res.writeHead(statusCode, {
    'content-type': 'text/html; charset=utf-8',
    'content-length': Buffer.byteLength(html),
    'cache-control': 'no-store, max-age=0',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'content-security-policy':
      "default-src 'none'; style-src 'none'; img-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  });
  res.end(html);
}

async function readBody(req) {
  let total = 0;
  const chunks = [];
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_SSO_BODY_BYTES) {
      throw boundaryError(
        'AKSHAERP_SSO_BODY_TOO_LARGE',
        'AkshaERP SSO request is too large.',
        413
      );
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function parseBody(req, raw) {
  const contentType = String(req.headers['content-type'] || '')
    .split(';')[0]
    .trim()
    .toLowerCase();

  if (contentType === 'application/json') {
    try {
      const parsed = JSON.parse(raw || '{}');
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('object required');
      }
      return parsed;
    } catch {
      throw boundaryError(
        'AKSHAERP_SSO_REQUEST_INVALID',
        'AkshaERP SSO JSON request is invalid.',
        400
      );
    }
  }

  if (
    !contentType ||
    contentType === 'application/x-www-form-urlencoded'
  ) {
    return Object.fromEntries(new URLSearchParams(raw || ''));
  }

  throw boundaryError(
    'AKSHAERP_SSO_CONTENT_TYPE_INVALID',
    'AkshaERP SSO requires form-urlencoded or JSON content.',
    415
  );
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
  const origin = String(req.headers.origin || '').trim().replace(/\/+$/, '');
  if (origin) return origin;

  const referer = String(req.headers.referer || '').trim();
  if (!referer) return '';

  try {
    return new URL(referer).origin;
  } catch {
    return '';
  }
}

function assertAllowedOrigin(req, allowedOrigins) {
  if (!allowedOrigins.size) {
    throw boundaryError(
      'AKSHAERP_SSO_ALLOWED_ORIGIN_REQUIRED',
      'AkshaERP SSO allowed origin is not configured.',
      500
    );
  }

  const origin = requestOrigin(req);
  if (!origin || !allowedOrigins.has(origin)) {
    throw boundaryError(
      'AKSHAERP_SSO_ORIGIN_DENIED',
      'AkshaERP SSO request origin is not allowed.',
      403
    );
  }
}

function safeReturnPath(value) {
  const path = String(value || '/').trim();
  if (!path.startsWith('/') || path.startsWith('//') || /[\r\n]/.test(path)) {
    return '/';
  }
  return path;
}

function requestMetadata(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '')
    .split(',')[0]
    .trim();
  return {
    userAgent: String(req.headers['user-agent'] || '').trim() || null,
    clientIp: forwarded || req.socket?.remoteAddress || null,
  };
}

function wantsJson(req) {
  return String(req.headers.accept || '').toLowerCase().includes('application/json');
}

function createAkshaErpSsoHttpHandler({
  identityProvider,
  ssoService = null,
  allowedOrigins = '',
} = {}) {
  const provider = String(identityProvider || 'LOCAL').trim().toUpperCase();
  const allowed = parseAllowedOrigins(allowedOrigins);

  return async function akshaErpSsoHttpHandler(req, res) {
    let url;
    try {
      url = new URL(req.url || '/', 'http://localhost');
    } catch {
      return false;
    }

    if (provider !== 'LOCAL' && LOCAL_ONLY_AUTH_PATHS.has(url.pathname)) {
      writeJson(res, 404, {
        error: {
          code: 'LOCAL_AUTH_DISABLED',
          message: 'Local AkshaConnect authentication is disabled for this deployment.',
        },
      });
      return true;
    }

    if (url.pathname !== SSO_PATH) return false;

    if (req.method !== 'POST') {
      writeJson(res, 405, {
        error: {
          code: 'METHOD_NOT_ALLOWED',
          message: 'POST is required.',
        },
      });
      return true;
    }

    try {
      if (provider !== 'AKSHAERP' || !ssoService) {
        throw boundaryError(
          'AKSHAERP_SSO_NOT_CONFIGURED',
          'AkshaERP SSO is not configured for this AkshaConnect deployment.',
          503
        );
      }

      assertAllowedOrigin(req, allowed);

      const raw = await readBody(req);
      const body = parseBody(req, raw);
      const erpToken = String(
        body.erp_access_token ??
        body.erpAccessToken ??
        ''
      ).trim();

      const result = await ssoService.loginFromErpToken(
        erpToken,
        requestMetadata(req)
      );

      if (wantsJson(req)) {
        writeJson(res, 200, result);
      } else {
        writeBootstrapHtml(
          res,
          result,
          safeReturnPath(body.return_path ?? body.returnPath)
        );
      }
    } catch (error) {
      const statusCode = error instanceof BoundaryError
        ? error.statusCode
        : 500;

      const publicError = error instanceof BoundaryError
        ? error
        : boundaryError(
            'AKSHAERP_SSO_FAILED',
            'AkshaConnect sign-in failed.',
            500
          );

      if (wantsJson(req)) {
        writeJson(res, statusCode, {
          error: {
            code: publicError.code,
            message: publicError.message,
          },
        });
      } else {
        writeErrorHtml(res, statusCode, publicError);
      }
    }

    return true;
  };
}

module.exports = {
  SSO_PATH,
  LOCAL_ONLY_AUTH_PATHS,
  parseAllowedOrigins,
  safeReturnPath,
  createAkshaErpSsoHttpHandler,
};
