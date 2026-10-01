'use strict';

const {
  BoundaryError,
  boundaryError,
} = require('../core/boundaryError');

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const MAX_OFFSET = 100000;

function clean(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function bearerToken(req) {
  const value = String(req.headers.authorization || '').trim();
  const match = /^Bearer\s+(.+)$/i.exec(value);
  return match ? match[1].trim() : '';
}

function writeJson(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  });
  res.end(payload);
}

function parsePageValue(value, { name, fallback, min, max }) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw boundaryError(
      'MESSAGE_READERS_PAGE_INVALID',
      `${name} must be between ${min} and ${max}`,
      400
    );
  }
  return parsed;
}

function trustedActor(claims = {}) {
  const workspaceId = clean(claims.workspace_id);
  const workspaceMemberId = clean(claims.workspace_member_id);
  const identityId = clean(claims.identity_id);

  if (!workspaceId || !workspaceMemberId || !identityId) {
    throw boundaryError(
      'VERIFIED_CONTEXT_REQUIRED',
      'Trusted workspace context is required',
      401
    );
  }

  return { workspaceId, workspaceMemberId, identityId };
}

async function requireActiveMember(db, actor) {
  const result = await db.query(`
    SELECT wm.workspace_member_id
    FROM ac_workspace_member wm
    JOIN ac_identity i
      ON i.identity_id = wm.identity_id
    WHERE wm.workspace_id = $1
      AND wm.workspace_member_id = $2
      AND wm.status = 'ACTIVE'
      AND i.status = 'ACTIVE'
    LIMIT 1
  `, [actor.workspaceId, actor.workspaceMemberId]);

  if (!result.rows?.[0]) {
    throw boundaryError(
      'WORKSPACE_ACCESS_DENIED',
      'Workspace access denied',
      403
    );
  }
}

async function requireConversationAccess(db, actor, conversationId) {
  const result = await db.query(`
    SELECT conv.conversation_id
    FROM ac_conversation conv
    LEFT JOIN ac_channel ch
      ON ch.workspace_id = conv.workspace_id
     AND ch.conversation_id = conv.conversation_id
     AND ch.status = 'ACTIVE'
    LEFT JOIN ac_channel_member cm
      ON cm.workspace_id = ch.workspace_id
     AND cm.channel_id = ch.channel_id
     AND cm.workspace_member_id = $2
     AND cm.left_at IS NULL
    LEFT JOIN ac_conversation_participant cp
      ON cp.workspace_id = conv.workspace_id
     AND cp.conversation_id = conv.conversation_id
     AND cp.workspace_member_id = $2
     AND cp.left_at IS NULL
    WHERE conv.workspace_id = $1
      AND conv.conversation_id = $3
      AND conv.status = 'ACTIVE'
      AND (
        (
          conv.conversation_type = 'CHANNEL'
          AND ch.channel_id IS NOT NULL
          AND cm.workspace_member_id IS NOT NULL
        )
        OR
        (
          conv.conversation_type IN ('DM', 'GROUP_DM')
          AND cp.workspace_member_id IS NOT NULL
        )
      )
    LIMIT 1
  `, [actor.workspaceId, actor.workspaceMemberId, conversationId]);

  if (!result.rows?.[0]) {
    throw boundaryError(
      'CONVERSATION_ACCESS_DENIED',
      'Conversation is unavailable',
      404
    );
  }
}

async function requireOwnMessage(db, actor, conversationId, messageId) {
  const result = await db.query(`
    SELECT
      message_id,
      sender_type,
      sender_member_id,
      reply_to_message_id,
      created_at,
      deleted_at
    FROM ac_message
    WHERE workspace_id = $1
      AND conversation_id = $2
      AND message_id = $3
    LIMIT 1
  `, [actor.workspaceId, conversationId, messageId]);

  const message = result.rows?.[0] || null;
  if (!message || message.deleted_at) {
    throw boundaryError(
      'MESSAGE_NOT_FOUND',
      'Message is unavailable',
      404
    );
  }

  if (
    message.sender_type !== 'HUMAN' ||
    clean(message.sender_member_id) !== actor.workspaceMemberId
  ) {
    throw boundaryError(
      'MESSAGE_READERS_NOT_ALLOWED',
      'Reader details are available only to the message sender',
      403
    );
  }

  return message;
}

async function listMainMessageReaders({
  db,
  actor,
  conversationId,
  message,
  limit,
  offset,
}) {
  const result = await db.query(`
    SELECT
      COALESCE(
        NULLIF(TRIM(wm.display_name_override), ''),
        NULLIF(TRIM(i.display_name), ''),
        'Former member'
      ) AS display_name,
      rc.read_at,
      COUNT(*) OVER()::int AS total_count
    FROM ac_read_cursor rc
    JOIN ac_message cursor_message
      ON cursor_message.workspace_id = rc.workspace_id
     AND cursor_message.conversation_id = rc.conversation_id
     AND cursor_message.message_id = rc.last_read_message_id
    LEFT JOIN ac_workspace_member wm
      ON wm.workspace_id = rc.workspace_id
     AND wm.workspace_member_id = rc.workspace_member_id
    LEFT JOIN ac_identity i
      ON i.identity_id = wm.identity_id
    WHERE rc.workspace_id = $1
      AND rc.conversation_id = $2
      AND rc.workspace_member_id IS DISTINCT FROM $3::uuid
      AND (cursor_message.created_at, cursor_message.message_id)
            >= ($4::timestamptz, $5::uuid)
    ORDER BY rc.read_at DESC, rc.workspace_member_id
    LIMIT $6 OFFSET $7
  `, [
    actor.workspaceId,
    conversationId,
    actor.workspaceMemberId,
    message.created_at,
    message.message_id,
    limit,
    offset,
  ]);

  return result.rows || [];
}

async function listThreadMessageReaders({
  db,
  actor,
  conversationId,
  message,
  limit,
  offset,
}) {
  const result = await db.query(`
    SELECT
      COALESCE(
        NULLIF(TRIM(wm.display_name_override), ''),
        NULLIF(TRIM(i.display_name), ''),
        'Former member'
      ) AS display_name,
      trc.read_at,
      COUNT(*) OVER()::int AS total_count
    FROM ac_thread_read_cursor trc
    JOIN ac_message cursor_reply
      ON cursor_reply.workspace_id = trc.workspace_id
     AND cursor_reply.conversation_id = trc.conversation_id
     AND cursor_reply.message_id = trc.last_read_message_id
    LEFT JOIN ac_workspace_member wm
      ON wm.workspace_id = trc.workspace_id
     AND wm.workspace_member_id = trc.workspace_member_id
    LEFT JOIN ac_identity i
      ON i.identity_id = wm.identity_id
    WHERE trc.workspace_id = $1
      AND trc.conversation_id = $2
      AND trc.thread_root_message_id = $3
      AND trc.workspace_member_id IS DISTINCT FROM $4::uuid
      AND (cursor_reply.created_at, cursor_reply.message_id)
            >= ($5::timestamptz, $6::uuid)
    ORDER BY trc.read_at DESC, trc.workspace_member_id
    LIMIT $7 OFFSET $8
  `, [
    actor.workspaceId,
    conversationId,
    message.reply_to_message_id,
    actor.workspaceMemberId,
    message.created_at,
    message.message_id,
    limit,
    offset,
  ]);

  return result.rows || [];
}

function publicReader(row) {
  return {
    display_name: clean(row?.display_name) || 'Member',
    read_at: row?.read_at || null,
  };
}

function createMessageReadersHttpHandler({
  localIdentityService,
  db,
} = {}) {
  if (!localIdentityService) {
    throw new TypeError('Local identity service is required');
  }
  if (!db || typeof db.query !== 'function') {
    throw new TypeError('Database pool is required');
  }

  return async function messageReadersHttpHandler(req, res) {
    const url = new URL(req.url, 'http://akshaconnect.local');
    const match =
      /^\/api\/v1\/conversations\/([^/]+)\/messages\/([^/]+)\/readers$/
        .exec(url.pathname);

    if (!match) return false;

    try {
      if (req.method !== 'GET') {
        throw boundaryError(
          'METHOD_NOT_ALLOWED',
          'Method not allowed',
          405
        );
      }

      const conversationId = decodeURIComponent(match[1]);
      const messageId = decodeURIComponent(match[2]);
      const limit = parsePageValue(
        url.searchParams.get('limit'),
        {
          name: 'limit',
          fallback: DEFAULT_LIMIT,
          min: 1,
          max: MAX_LIMIT,
        }
      );
      const offset = parsePageValue(
        url.searchParams.get('offset'),
        {
          name: 'offset',
          fallback: 0,
          min: 0,
          max: MAX_OFFSET,
        }
      );

      const claims = await localIdentityService.verifyAccessToken(
        bearerToken(req)
      );
      const actor = trustedActor(claims);

      await requireActiveMember(db, actor);
      await requireConversationAccess(db, actor, conversationId);
      const message = await requireOwnMessage(
        db,
        actor,
        conversationId,
        messageId
      );

      const rows = message.reply_to_message_id
        ? await listThreadMessageReaders({
            db,
            actor,
            conversationId,
            message,
            limit,
            offset,
          })
        : await listMainMessageReaders({
            db,
            actor,
            conversationId,
            message,
            limit,
            offset,
          });

      const total = Number(rows?.[0]?.total_count || 0);
      const readers = (rows || []).map(publicReader);
      const consumed = offset + readers.length;
      const hasMore = consumed < total;

      writeJson(res, 200, {
        message_id: message.message_id,
        readers,
        total,
        page: {
          limit,
          offset,
          has_more: hasMore,
          next_offset: hasMore ? consumed : null,
        },
      });
      return true;
    } catch (error) {
      if (error instanceof URIError) {
        writeJson(res, 400, {
          error: {
            code: 'MESSAGE_READERS_ROUTE_INVALID',
            message: 'Message reader route is invalid',
          },
        });
        return true;
      }

      if (error instanceof BoundaryError) {
        writeJson(res, error.statusCode || 500, {
          error: {
            code: error.code || 'REQUEST_FAILED',
            message: error.message || 'Request failed',
          },
        });
        return true;
      }

      writeJson(res, 500, {
        error: {
          code: 'MESSAGE_READERS_FAILED',
          message: 'Could not load message readers',
        },
      });
      return true;
    }
  };
}

module.exports = {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  MAX_OFFSET,
  createMessageReadersHttpHandler,
};
