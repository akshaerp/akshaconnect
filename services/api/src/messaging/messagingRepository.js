'use strict';

const { randomUUID } = require('node:crypto');

function createMessagingRepository(db, { messageCrypto } = {}) {
  if (!db || typeof db.query !== 'function' || typeof db.connect !== 'function') {
    throw new TypeError('A PostgreSQL pool is required');
  }
  if (!messageCrypto || typeof messageCrypto.encryptText !== 'function' || typeof messageCrypto.decryptText !== 'function') {
    throw new TypeError('Message crypto is required');
  }

  function materializeMessage(row) {
    if (!row) return null;
    const {
      workspace_id: workspaceId,
      body_ciphertext: bodyCiphertext,
      body_nonce: bodyNonce,
      body_auth_tag: bodyAuthTag,
      body_key_id: bodyKeyId,
      body_encryption_version: bodyEncryptionVersion,
      ...publicRow
    } = row;

    const bodyText = messageCrypto.decryptText({
      body_ciphertext: bodyCiphertext,
      body_nonce: bodyNonce,
      body_auth_tag: bodyAuthTag,
      body_key_id: bodyKeyId,
      body_encryption_version: bodyEncryptionVersion,
    }, {
      recordType: 'MESSAGE',
      workspaceId,
      conversationId: row.conversation_id,
      recordId: row.message_id,
    });

    return { ...publicRow, body_text: bodyText };
  }

  async function getActiveWorkspaceMember({ workspaceId, workspaceMemberId }) {
    const result = await db.query(`
      SELECT
        wm.workspace_member_id,
        wm.identity_id,
        wm.member_role,
        wm.status AS member_status,
        i.status AS identity_status,
        COALESCE(wm.display_name_override, i.display_name) AS display_name,
        i.primary_email
      FROM ac_workspace_member wm
      JOIN ac_identity i ON i.identity_id = wm.identity_id
      WHERE wm.workspace_id = $1
        AND wm.workspace_member_id = $2
        AND wm.status = 'ACTIVE'
        AND i.status = 'ACTIVE'
      LIMIT 1
    `, [workspaceId, workspaceMemberId]);

    return result.rows?.[0] || null;
  }

  async function getConversationAccess({ workspaceId, workspaceMemberId, conversationId }) {
    const result = await db.query(`
      SELECT
        conv.conversation_id,
        conv.conversation_type,
        conv.status,
        ch.channel_id,
        ch.visibility AS channel_visibility,
        (cm.workspace_member_id IS NOT NULL) AS is_channel_member,
        (cp.workspace_member_id IS NOT NULL) AS is_participant
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
            AND (ch.visibility = 'PUBLIC' OR cm.workspace_member_id IS NOT NULL)
          )
          OR
          (
            conv.conversation_type IN ('DM', 'GROUP_DM')
            AND cp.workspace_member_id IS NOT NULL
          )
        )
      LIMIT 1
    `, [workspaceId, workspaceMemberId, conversationId]);

    return result.rows?.[0] || null;
  }

  async function getActiveConversation({ workspaceId, conversationId }) {
    const result = await db.query(`
      SELECT conversation_id, conversation_type, status
      FROM ac_conversation
      WHERE workspace_id = $1
        AND conversation_id = $2
        AND status = 'ACTIVE'
      LIMIT 1
    `, [workspaceId, conversationId]);
    return result.rows?.[0] || null;
  }

  async function getMessageInConversation({ workspaceId, conversationId, messageId }) {
    const result = await db.query(`
      SELECT message_id, conversation_id, created_at
      FROM ac_message
      WHERE workspace_id = $1
        AND conversation_id = $2
        AND message_id = $3
      LIMIT 1
    `, [workspaceId, conversationId, messageId]);
    return result.rows?.[0] || null;
  }

  async function messageDetails({ workspaceId, conversationId, messageId }) {
    const result = await db.query(`
      SELECT
        m.workspace_id,
        m.message_id,
        m.conversation_id,
        m.sender_type,
        m.sender_member_id,
        m.system_sender_id,
        m.message_type,
        m.body_ciphertext,
        m.body_nonce,
        m.body_auth_tag,
        m.body_key_id,
        m.body_encryption_version,
        m.client_message_id,
        m.source_event_id,
        m.reply_to_message_id,
        m.created_at,
        m.edited_at,
        m.deleted_at,
        CASE
          WHEN m.sender_type = 'HUMAN'
            THEN COALESCE(wm.display_name_override, i.display_name)
          ELSE ss.display_name
        END AS sender_display_name,
        CASE
          WHEN m.sender_type = 'HUMAN' THEN i.primary_email
          ELSE NULL
        END AS sender_primary_email
      FROM ac_message m
      LEFT JOIN ac_workspace_member wm
        ON wm.workspace_id = m.workspace_id
       AND wm.workspace_member_id = m.sender_member_id
      LEFT JOIN ac_identity i ON i.identity_id = wm.identity_id
      LEFT JOIN ac_system_sender ss
        ON ss.workspace_id = m.workspace_id
       AND ss.system_sender_id = m.system_sender_id
      WHERE m.workspace_id = $1
        AND m.conversation_id = $2
        AND m.message_id = $3
      LIMIT 1
    `, [workspaceId, conversationId, messageId]);
    return materializeMessage(result.rows?.[0] || null);
  }

  async function findHumanMessageByClientId({ workspaceId, conversationId, clientMessageId }) {
    const result = await db.query(`
      SELECT message_id
      FROM ac_message
      WHERE workspace_id = $1
        AND conversation_id = $2
        AND client_message_id = $3
      LIMIT 1
    `, [workspaceId, conversationId, clientMessageId]);

    if (!result.rows?.[0]) return null;
    return messageDetails({ workspaceId, conversationId, messageId: result.rows[0].message_id });
  }

  async function createHumanMessage({
    workspaceId,
    conversationId,
    senderMemberId,
    bodyText,
    clientMessageId,
    replyToMessageId,
  }) {
    const messageId = randomUUID();
    const encrypted = messageCrypto.encryptText(bodyText, {
      recordType: 'MESSAGE',
      workspaceId,
      conversationId,
      recordId: messageId,
    });
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const inserted = await client.query(`
        INSERT INTO ac_message (
          message_id,
          workspace_id,
          conversation_id,
          sender_type,
          sender_member_id,
          message_type,
          body_ciphertext,
          body_nonce,
          body_auth_tag,
          body_key_id,
          body_encryption_version,
          client_message_id,
          reply_to_message_id
        )
        VALUES ($1, $2, $3, 'HUMAN', $4, 'TEXT', $5, $6, $7, $8, $9, $10, $11)
        RETURNING message_id
      `, [
        messageId,
        workspaceId,
        conversationId,
        senderMemberId,
        encrypted.bodyCiphertext,
        encrypted.bodyNonce,
        encrypted.bodyAuthTag,
        encrypted.bodyKeyId,
        encrypted.bodyEncryptionVersion,
        clientMessageId,
        replyToMessageId || null,
      ]);

      await client.query(`
        UPDATE ac_conversation
        SET updated_at = NOW()
        WHERE workspace_id = $1 AND conversation_id = $2
      `, [workspaceId, conversationId]);

      await client.query('COMMIT');
      return messageDetails({
        workspaceId,
        conversationId,
        messageId: inserted.rows[0].message_id,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async function listMessages({ workspaceId, conversationId, limit, beforeMessageId }) {
    let cursor = null;
    if (beforeMessageId) {
      const cursorResult = await db.query(`
        SELECT message_id, created_at
        FROM ac_message
        WHERE workspace_id = $1
          AND conversation_id = $2
          AND message_id = $3
        LIMIT 1
      `, [workspaceId, conversationId, beforeMessageId]);
      cursor = cursorResult.rows?.[0] || null;
      if (!cursor) return { cursorInvalid: true, rows: [], hasMore: false, nextBeforeMessageId: null };
    }

    const params = [workspaceId, conversationId, limit + 1];
    let cursorClause = '';
    if (cursor) {
      params.push(cursor.created_at, cursor.message_id);
      cursorClause = `AND (m.created_at, m.message_id) < ($4::timestamptz, $5::uuid)`;
    }

    const result = await db.query(`
      SELECT
        m.workspace_id,
        m.message_id,
        m.conversation_id,
        m.sender_type,
        m.sender_member_id,
        m.system_sender_id,
        m.message_type,
        m.body_ciphertext,
        m.body_nonce,
        m.body_auth_tag,
        m.body_key_id,
        m.body_encryption_version,
        m.client_message_id,
        m.source_event_id,
        m.reply_to_message_id,
        m.created_at,
        m.edited_at,
        m.deleted_at,
        CASE
          WHEN m.sender_type = 'HUMAN'
            THEN COALESCE(wm.display_name_override, i.display_name)
          ELSE ss.display_name
        END AS sender_display_name,
        CASE
          WHEN m.sender_type = 'HUMAN' THEN i.primary_email
          ELSE NULL
        END AS sender_primary_email
      FROM ac_message m
      LEFT JOIN ac_workspace_member wm
        ON wm.workspace_id = m.workspace_id
       AND wm.workspace_member_id = m.sender_member_id
      LEFT JOIN ac_identity i ON i.identity_id = wm.identity_id
      LEFT JOIN ac_system_sender ss
        ON ss.workspace_id = m.workspace_id
       AND ss.system_sender_id = m.system_sender_id
      WHERE m.workspace_id = $1
        AND m.conversation_id = $2
        ${cursorClause}
      ORDER BY m.created_at DESC, m.message_id DESC
      LIMIT $3
    `, params);

    const descending = result.rows || [];
    const hasMore = descending.length > limit;
    const pageDescending = descending.slice(0, limit);
    const nextBeforeMessageId = hasMore && pageDescending.length
      ? pageDescending[pageDescending.length - 1].message_id
      : null;

    return {
      cursorInvalid: false,
      rows: pageDescending.reverse().map(materializeMessage),
      hasMore,
      nextBeforeMessageId,
    };
  }

  async function getReadCursor({ workspaceId, conversationId, workspaceMemberId }) {
    const result = await db.query(`
      SELECT
        workspace_id,
        conversation_id,
        workspace_member_id,
        last_read_message_id,
        read_at
      FROM ac_read_cursor
      WHERE workspace_id = $1
        AND conversation_id = $2
        AND workspace_member_id = $3
      LIMIT 1
    `, [workspaceId, conversationId, workspaceMemberId]);
    return result.rows?.[0] || null;
  }

  async function advanceReadCursor({
    workspaceId,
    conversationId,
    workspaceMemberId,
    lastReadMessageId,
  }) {
    const result = await db.query(`
      INSERT INTO ac_read_cursor (
        workspace_id,
        conversation_id,
        workspace_member_id,
        last_read_message_id,
        read_at
      )
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (workspace_id, conversation_id, workspace_member_id)
      DO UPDATE SET
        last_read_message_id = EXCLUDED.last_read_message_id,
        read_at = NOW()
      WHERE ac_read_cursor.last_read_message_id IS NULL
         OR EXISTS (
            SELECT 1
            FROM ac_message current_message
            JOIN ac_message candidate_message
              ON candidate_message.workspace_id = current_message.workspace_id
             AND candidate_message.conversation_id = current_message.conversation_id
            WHERE current_message.workspace_id = ac_read_cursor.workspace_id
              AND current_message.conversation_id = ac_read_cursor.conversation_id
              AND current_message.message_id = ac_read_cursor.last_read_message_id
              AND candidate_message.message_id = EXCLUDED.last_read_message_id
              AND (current_message.created_at, current_message.message_id)
                    <= (candidate_message.created_at, candidate_message.message_id)
         )
      RETURNING
        workspace_id,
        conversation_id,
        workspace_member_id,
        last_read_message_id,
        read_at
    `, [workspaceId, conversationId, workspaceMemberId, lastReadMessageId]);

    if (result.rows?.[0]) {
      return { ...result.rows[0], advanced: true };
    }

    const current = await getReadCursor({ workspaceId, conversationId, workspaceMemberId });
    return current ? { ...current, advanced: false } : null;
  }

  async function getActiveSystemSender({ workspaceId, systemSenderId }) {
    const result = await db.query(`
      SELECT system_sender_id, sender_code, display_name, provider_code, external_reference
      FROM ac_system_sender
      WHERE workspace_id = $1
        AND system_sender_id = $2
        AND status = 'ACTIVE'
      LIMIT 1
    `, [workspaceId, systemSenderId]);
    return result.rows?.[0] || null;
  }

  async function findSystemMessageBySourceEvent({
    workspaceId,
    conversationId,
    systemSenderId,
    sourceEventId,
  }) {
    const result = await db.query(`
      SELECT message_id
      FROM ac_message
      WHERE workspace_id = $1
        AND conversation_id = $2
        AND sender_type = 'SYSTEM'
        AND system_sender_id = $3
        AND source_event_id = $4
      LIMIT 1
    `, [workspaceId, conversationId, systemSenderId, sourceEventId]);
    if (!result.rows?.[0]) return null;
    return messageDetails({ workspaceId, conversationId, messageId: result.rows[0].message_id });
  }

  async function createSystemMessage({
    workspaceId,
    conversationId,
    systemSenderId,
    sourceEventId,
    bodyText,
    messageType,
  }) {
    const messageId = randomUUID();
    const encrypted = messageCrypto.encryptText(bodyText, {
      recordType: 'MESSAGE',
      workspaceId,
      conversationId,
      recordId: messageId,
    });
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const inserted = await client.query(`
        INSERT INTO ac_message (
          message_id,
          workspace_id,
          conversation_id,
          sender_type,
          system_sender_id,
          message_type,
          body_ciphertext,
          body_nonce,
          body_auth_tag,
          body_key_id,
          body_encryption_version,
          source_event_id
        )
        VALUES ($1, $2, $3, 'SYSTEM', $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING message_id
      `, [
        messageId,
        workspaceId,
        conversationId,
        systemSenderId,
        messageType,
        encrypted?.bodyCiphertext || null,
        encrypted?.bodyNonce || null,
        encrypted?.bodyAuthTag || null,
        encrypted?.bodyKeyId || null,
        encrypted?.bodyEncryptionVersion || null,
        sourceEventId,
      ]);

      await client.query(`
        UPDATE ac_conversation
        SET updated_at = NOW()
        WHERE workspace_id = $1 AND conversation_id = $2
      `, [workspaceId, conversationId]);

      await client.query('COMMIT');
      return messageDetails({
        workspaceId,
        conversationId,
        messageId: inserted.rows[0].message_id,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }


  async function listUnreadCounts({ workspaceId, workspaceMemberId }) {
    const result = await db.query(`
      WITH accessible_conversations AS (
        SELECT DISTINCT
          conv.conversation_id
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
          AND conv.status = 'ACTIVE'
          AND (
            (
              conv.conversation_type = 'CHANNEL'
              AND ch.channel_id IS NOT NULL
              AND (ch.visibility = 'PUBLIC' OR cm.workspace_member_id IS NOT NULL)
            )
            OR
            (
              conv.conversation_type IN ('DM', 'GROUP_DM')
              AND cp.workspace_member_id IS NOT NULL
            )
          )
      ), cursor_position AS (
        SELECT
          rc.conversation_id,
          rc.last_read_message_id,
          m.created_at AS last_read_created_at
        FROM ac_read_cursor rc
        LEFT JOIN ac_message m
          ON m.workspace_id = rc.workspace_id
         AND m.conversation_id = rc.conversation_id
         AND m.message_id = rc.last_read_message_id
        WHERE rc.workspace_id = $1
          AND rc.workspace_member_id = $2
      )
      SELECT
        ac.conversation_id,
        COUNT(m.message_id) FILTER (
          WHERE m.message_id IS NOT NULL
            AND (m.sender_type <> 'HUMAN' OR m.sender_member_id IS DISTINCT FROM $2::uuid)
            AND (
              cp.last_read_message_id IS NULL
              OR (m.created_at, m.message_id) > (cp.last_read_created_at, cp.last_read_message_id)
            )
        )::integer AS unread_count
      FROM accessible_conversations ac
      LEFT JOIN cursor_position cp
        ON cp.conversation_id = ac.conversation_id
      LEFT JOIN ac_message m
        ON m.workspace_id = $1
       AND m.conversation_id = ac.conversation_id
      GROUP BY ac.conversation_id
      ORDER BY ac.conversation_id
    `, [workspaceId, workspaceMemberId]);

    return result.rows || [];
  }

  async function listConversationRecipientMemberIds({ workspaceId, conversationId }) {
    const result = await db.query(`
      SELECT DISTINCT eligible.workspace_member_id
      FROM (
        SELECT wm.workspace_member_id
        FROM ac_conversation conv
        JOIN ac_channel ch
          ON ch.workspace_id = conv.workspace_id
         AND ch.conversation_id = conv.conversation_id
         AND ch.status = 'ACTIVE'
        JOIN ac_workspace_member wm
          ON wm.workspace_id = conv.workspace_id
         AND wm.status = 'ACTIVE'
        JOIN ac_identity i
          ON i.identity_id = wm.identity_id
         AND i.status = 'ACTIVE'
        LEFT JOIN ac_channel_member cm
          ON cm.workspace_id = ch.workspace_id
         AND cm.channel_id = ch.channel_id
         AND cm.workspace_member_id = wm.workspace_member_id
         AND cm.left_at IS NULL
        WHERE conv.workspace_id = $1
          AND conv.conversation_id = $2
          AND conv.status = 'ACTIVE'
          AND conv.conversation_type = 'CHANNEL'
          AND (ch.visibility = 'PUBLIC' OR cm.workspace_member_id IS NOT NULL)

        UNION

        SELECT cp.workspace_member_id
        FROM ac_conversation conv
        JOIN ac_conversation_participant cp
          ON cp.workspace_id = conv.workspace_id
         AND cp.conversation_id = conv.conversation_id
         AND cp.left_at IS NULL
        JOIN ac_workspace_member wm
          ON wm.workspace_id = cp.workspace_id
         AND wm.workspace_member_id = cp.workspace_member_id
         AND wm.status = 'ACTIVE'
        JOIN ac_identity i
          ON i.identity_id = wm.identity_id
         AND i.status = 'ACTIVE'
        WHERE conv.workspace_id = $1
          AND conv.conversation_id = $2
          AND conv.status = 'ACTIVE'
          AND conv.conversation_type IN ('DM', 'GROUP_DM')
      ) eligible
      ORDER BY eligible.workspace_member_id
    `, [workspaceId, conversationId]);

    return (result.rows || []).map((row) => row.workspace_member_id);
  }

  return Object.freeze({
    getActiveWorkspaceMember,
    getConversationAccess,
    getActiveConversation,
    getMessageInConversation,
    findHumanMessageByClientId,
    createHumanMessage,
    listMessages,
    getReadCursor,
    advanceReadCursor,
    getActiveSystemSender,
    findSystemMessageBySourceEvent,
    createSystemMessage,
    listUnreadCounts,
    listConversationRecipientMemberIds,
  });
}

module.exports = { createMessagingRepository };
