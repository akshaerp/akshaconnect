'use strict';

const { BoundaryError, boundaryError } = require('../core/boundaryError');

const WORKSPACES_PATH = '/api/v1/auth/workspaces';
const SWITCH_PATH = '/api/v1/auth/workspace/switch';
const MAX_BODY_BYTES = 8 * 1024;

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
    if (total > MAX_BODY_BYTES) {
      throw boundaryError(
        'WORKSPACE_SWITCH_BODY_TOO_LARGE',
        'Workspace switch request is too large.',
        413
      );
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
    throw boundaryError(
      'WORKSPACE_SWITCH_REQUEST_INVALID',
      'Workspace switch request must be a JSON object.',
      400
    );
  }
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

function createWorkspaceSessionHttpHandler({ workspaceSessionService } = {}) {
  if (
    !workspaceSessionService ||
    typeof workspaceSessionService.listWorkspaces !== 'function' ||
    typeof workspaceSessionService.switchWorkspace !== 'function'
  ) {
    throw new TypeError('A workspace session service is required');
  }

  return async function workspaceSessionHttpHandler(req, res) {
    let url;
    try {
      url = new URL(req.url || '/', 'http://localhost');
    } catch {
      return false;
    }

    if (url.pathname !== WORKSPACES_PATH && url.pathname !== SWITCH_PATH) {
      return false;
    }

    try {
      if (url.pathname === WORKSPACES_PATH) {
        if (req.method !== 'GET') {
          throw boundaryError('METHOD_NOT_ALLOWED', 'GET is required.', 405);
        }

        const result = await workspaceSessionService.listWorkspaces(
          bearerToken(req)
        );
        writeJson(res, 200, result);
        return true;
      }

      if (req.method !== 'POST') {
        throw boundaryError('METHOD_NOT_ALLOWED', 'POST is required.', 405);
      }

      const body = await readJson(req);
      const result = await workspaceSessionService.switchWorkspace(
        bearerToken(req),
        body,
        requestMetadata(req)
      );

      writeJson(res, 200, result);
      return true;
    } catch (error) {
      const statusCode = error instanceof BoundaryError
        ? error.statusCode
        : 500;

      const publicError = error instanceof BoundaryError
        ? error
        : boundaryError(
            'WORKSPACE_SWITCH_FAILED',
            'Workspace switching failed.',
            500
          );

      writeJson(res, statusCode, {
        error: {
          code: publicError.code,
          message: publicError.message,
        },
      });
      return true;
    }
  };
}

module.exports = {
  WORKSPACES_PATH,
  SWITCH_PATH,
  createWorkspaceSessionHttpHandler,
};
