'use strict';

const { BoundaryError, boundaryError } = require('../core/boundaryError');

const WORKSPACE_MEMBERS_PATH = '/api/v1/workspace/members';
const DIRECT_MESSAGES_PATH = '/api/v1/direct-messages';
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
        'DIRECTORY_REQUEST_BODY_TOO_LARGE',
        'Directory request body is too large.',
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
      'DIRECTORY_REQUEST_INVALID',
      'Directory request must be a JSON object.',
      400
    );
  }
}

function createWorkspaceDirectoryHttpHandler({
  identityService,
  directoryService,
  collaborationService,
} = {}) {
  if (
    !identityService ||
    typeof identityService.verifyAccessToken !== 'function'
  ) {
    throw new TypeError('An identity service is required');
  }

  if (
    !directoryService ||
    typeof directoryService.searchUsers !== 'function' ||
    typeof directoryService.resolveTargetMember !== 'function' ||
    typeof directoryService.isDirectoryMemberId !== 'function'
  ) {
    throw new TypeError('A directory service is required');
  }

  if (
    !collaborationService ||
    typeof collaborationService.startDirectMessage !== 'function'
  ) {
    throw new TypeError('A collaboration service is required');
  }

  return async function workspaceDirectoryHttpHandler(req, res) {
    let url;
    try {
      url = new URL(req.url || '/', 'http://localhost');
    } catch {
      return false;
    }

    const isWorkspaceMembers =
      url.pathname === WORKSPACE_MEMBERS_PATH;
    const isDirectMessageCreate =
      url.pathname === DIRECT_MESSAGES_PATH &&
      req.method === 'POST';

    if (!isWorkspaceMembers && !isDirectMessageCreate) {
      return false;
    }

    try {
      const claims = await identityService.verifyAccessToken(
        bearerToken(req)
      );

      if (isWorkspaceMembers) {
        if (req.method !== 'GET') {
          throw boundaryError(
            'METHOD_NOT_ALLOWED',
            'GET is required.',
            405
          );
        }

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
        return true;
      }

      const body = await readJson(req);
      const requestedTarget = String(
        body.target_workspace_member_id ??
        body.targetWorkspaceMemberId ??
        ''
      ).trim();

      let targetWorkspaceMemberId = requestedTarget;

      if (directoryService.isDirectoryMemberId(requestedTarget)) {
        const resolved = await directoryService.resolveTargetMember(
          claims,
          {
            directory_member_id: requestedTarget,
          }
        );
        targetWorkspaceMemberId = resolved.workspace_member_id;
      }

      const directMessage =
        await collaborationService.startDirectMessage(
          claims,
          {
            ...body,
            target_workspace_member_id:
              targetWorkspaceMemberId,
          }
        );

      writeJson(
        res,
        directMessage.created ? 201 : 200,
        { direct_message: directMessage }
      );
      return true;
    } catch (error) {
      const statusCode = error instanceof BoundaryError
        ? error.statusCode
        : 500;

      const publicError = error instanceof BoundaryError
        ? error
        : boundaryError(
            'WORKSPACE_DIRECTORY_FAILED',
            'Workspace directory request failed.',
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
  WORKSPACE_MEMBERS_PATH,
  DIRECT_MESSAGES_PATH,
  MAX_BODY_BYTES,
  createWorkspaceDirectoryHttpHandler,
};
