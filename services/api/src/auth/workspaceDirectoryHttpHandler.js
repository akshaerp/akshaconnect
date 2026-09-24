'use strict';

const { BoundaryError, boundaryError } = require('../core/boundaryError');

const WORKSPACE_MEMBERS_PATH = '/api/v1/workspace/members';

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

function createWorkspaceDirectoryHttpHandler({
  identityService,
  directoryService,
} = {}) {
  if (
    !identityService ||
    typeof identityService.verifyAccessToken !== 'function'
  ) {
    throw new TypeError('An identity service is required');
  }

  if (
    !directoryService ||
    typeof directoryService.searchUsers !== 'function'
  ) {
    throw new TypeError('A directory service is required');
  }

  return async function workspaceDirectoryHttpHandler(req, res) {
    let url;
    try {
      url = new URL(req.url || '/', 'http://localhost');
    } catch {
      return false;
    }

    if (url.pathname !== WORKSPACE_MEMBERS_PATH) return false;

    try {
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

      const members = await directoryService.searchUsers(
        claims,
        {
          search_text:
            url.searchParams.get('query') || '',
          limit:
            url.searchParams.get('limit') || undefined,
        }
      );

      writeJson(res, 200, { members });
    } catch (error) {
      const statusCode = error instanceof BoundaryError
        ? error.statusCode
        : 500;

      const publicError = error instanceof BoundaryError
        ? error
        : boundaryError(
            'WORKSPACE_DIRECTORY_FAILED',
            'Workspace directory search failed.',
            500
          );

      writeJson(res, statusCode, {
        error: {
          code: publicError.code,
          message: publicError.message,
        },
      });
    }

    return true;
  };
}

module.exports = {
  WORKSPACE_MEMBERS_PATH,
  createWorkspaceDirectoryHttpHandler,
};
