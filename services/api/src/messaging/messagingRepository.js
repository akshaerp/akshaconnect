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

  async function decorateMentions({ workspaceId, messages }) {
    const rows = messages || [];
    const ids = rows.map((item) => item?.message_id).filter(Boolean);
    if (!ids.length) return rows;

    const result = await db.query(`
      SELECT
        mention_id,
        message_id,
        mention_type,
        target_workspace_member_id,
        target_channel_conversation_id,
        display_text
      FROM ac_message_mention
      WHERE workspace_id = $1
        AND message_id = ANY($2::uuid[])
      ORDER BY created_at, mention_id
    `, [workspaceId, ids]);

    const byMessage = new Map();
    for (const mention of result.rows || []) {
      const current = byMessage.get(mention.message_id) || [];
      current.push(mention);
      byMessage.set(mention.message_id, current);
    }

    return rows.map((message) => ({
      ...message,
      mentions: byMessage.get(message.message_id) || [],
    }));
  }

  async function replaceMessageMentions(client, {
    workspaceId,
    conversationId,
    messageId,
    mentions = [],
  }) {
    await client.query(`
      DELETE FROM ac_message_mention
      WHERE workspace_id = $1
        AND conversation_id = $2
        AND message_id = $3
    `, [workspaceId, conversationId, messageId]);

    for (const mention of mentions || []) {
      await client.query(`
        INSERT INTO ac_message_mention (
          mention_id,
          workspace_id,
          conversation_id,
          message_id,
          mention_type,
          target_workspace_member_id,
          target_channel_conversation_id,
          display_text
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      `, [
        randomUUID(),
        workspaceId,
        conversationId,
        messageId,
        mention.mention_type,
        mention.target_workspace_member_id || null,
        mention.target_channel_conversation_id || null,
        mention.display_text,
      ]);
    }
  }

  async function getMentionMemberTarget({
    workspaceId,
    conversationId,
    targetMemberId,
  }) {
    const eligible = await listConversationRecipientMemberIds({
      workspaceId,
      conversationId,
    });
    if (!eligible.includes(targetMemberId)) return null;
    return getActiveWorkspaceMember({
      workspaceId,
      workspaceMemberId: targetMemberId,
    });
  }

  async function getAccessibleChannelReference({
    workspaceId,
    requesterMemberId,
    targetConversationId,
  }) {
    const result = await db.query(`
      SELECT c.conversation_id, c.channel_name, c.channel_code
      FROM ac_channel c
      JOIN ac_conversation conv
        ON conv.workspace_id = c.workspace_id
       AND conv.conversation_id = c.conversation_id
       AND conv.status = 'ACTIVE'
      JOIN ac_channel_member cm
        ON cm.workspace_id = c.workspace_id
       AND cm.channel_id = c.channel_id
       AND cm.workspace_member_id = $2
       AND cm.left_at IS NULL
      WHERE c.workspace_id = $1
        AND c.conversation_id = $3
        AND c.status = 'ACTIVE'
      LIMIT 1
    `, [workspaceId, requesterMemberId, targetConversationId]);
    return result.rows?.[0] || null;
  }

  async function listMentionCandidates({
    workspaceId,
    conversationId,
    requesterMemberId,
    kind,
    query,
    limit,
  }) {
    const needle = String(query || '').trim();
    const like = `%${needle}%`;

    if (kind === 'CHANNEL') {
      const result = await db.query(`
        SELECT
          'CHANNEL'::text AS mention_type,
          c.conversation_id AS target_id,
          c.channel_name,
          c.channel_code
        FROM ac_channel c
        JOIN ac_conversation conv
          ON conv.workspace_id = c.workspace_id
         AND conv.conversation_id = c.conversation_id
         AND conv.status = 'ACTIVE'
        JOIN ac_channel_member cm
          ON cm.workspace_id = c.workspace_id
         AND cm.channel_id = c.channel_id
         AND cm.workspace_member_id = $2
         AND cm.left_at IS NULL
        WHERE c.workspace_id = $1
          AND c.status = 'ACTIVE'
          AND ($3 = '' OR c.channel_name ILIKE $4 OR c.channel_code ILIKE $4)
        ORDER BY LOWER(c.channel_name)
        LIMIT $5
      `, [workspaceId, requesterMemberId, needle, like, limit]);
      return result.rows || [];
    }

    const eligible = await listConversationRecipientMemberIds({
      workspaceId,
      conversationId,
    });
    if (!eligible.length) return [];

    const result = await db.query(`
      SELECT
        'MEMBER'::text AS mention_type,
        wm.workspace_member_id AS target_id,
        wm.workspace_member_id,
        COALESCE(wm.display_name_override, i.display_name) AS display_name,
        i.primary_email
      FROM ac_workspace_member wm
      JOIN ac_identity i
        ON i.identity_id = wm.identity_id
       AND i.status = 'ACTIVE'
      WHERE wm.workspace_id = $1
        AND wm.workspace_member_id = ANY($2::uuid[])
        AND wm.status = 'ACTIVE'
        AND wm.workspace_member_id <> $3
        AND (
          $4 = ''
          OR COALESCE(wm.display_name_override, i.display_name) ILIKE $5
          OR COALESCE(i.primary_email, '') ILIKE $5
        )
      ORDER BY LOWER(COALESCE(wm.display_name_override, i.display_name))
      LIMIT $6
    `, [workspaceId, eligible, requesterMemberId, needle, like, limit]);
    return result.rows || [];
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
            AND cm.workspace_member_id IS NOT NULL
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
      SELECT message_id, conversation_id, reply_to_message_id, quote_message_id, created_at, deleted_at
      FROM ac_message
      WHERE workspace_id = $1
        AND conversation_id = $2
        AND message_id = $3
      LIMIT 1
    `, [workspaceId, conversationId, messageId]);
    return result.rows?.[0] || null;
  }

  async function getMessagePreviews({
    workspaceId,
    conversationId,
    messageIds,
  }) {
    const ids = [...new Set(
      (messageIds || [])
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )];

    if (!ids.length) return [];

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
        m.quote_message_id,
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
        AND m.message_id = ANY($3::uuid[])
    `, [workspaceId, conversationId, ids]);

    return (result.rows || []).map(materializeMessage);
  }

  async function hydrateQuotedMessages({
    workspaceId,
    conversationId,
    messages,
  }) {
    const rows = messages || [];
    const quoteIds = rows
      .map((message) => message?.quote_message_id)
      .filter(Boolean);

    if (!quoteIds.length) {
      return rows.map((message) => ({
        ...message,
        quoted_message: null,
      }));
    }

    const previews = await getMessagePreviews({
      workspaceId,
      conversationId,
      messageIds: quoteIds,
    });

    const byId = new Map(
      previews.map((preview) => [
        preview.message_id,
        {
          message_id: preview.message_id,
          sender_type: preview.sender_type,
          sender_member_id: preview.sender_member_id,
          message_type: preview.message_type,
          body_text: preview.body_text,
          sender_display_name: preview.sender_display_name,
          created_at: preview.created_at,
          edited_at: preview.edited_at,
          deleted_at: preview.deleted_at,
        },
      ])
    );

    return rows.map((message) => ({
      ...message,
      quoted_message:
        (message?.quote_message_id &&
          byId.get(message.quote_message_id)) ||
        null,
    }));
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
        m.quote_message_id,
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

    const materialized =
      materializeMessage(result.rows?.[0] || null);

    if (!materialized) return null;

    const hydrated = await hydrateQuotedMessages({
      workspaceId,
      conversationId,
      messages: [materialized],
    });

    const withMentions = await decorateMentions({
      workspaceId,
      messages: hydrated,
    });

    return withMentions[0] || materialized;
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
    quoteMessageId,
    mentions = [],
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
          reply_to_message_id,
          quote_message_id
        )
        VALUES ($1, $2, $3, 'HUMAN', $4, 'TEXT', $5, $6, $7, $8, $9, $10, $11, $12)
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
        quoteMessageId || null,
      ]);

      await replaceMessageMentions(client, {
        workspaceId,
        conversationId,
        messageId,
        mentions,
      });

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

  async function updateHumanTextMessage({
    workspaceId,
    conversationId,
    messageId,
    editorMemberId,
    bodyText,
    mentions = null,
  }) {
    const client = await db.connect();

    try {
      await client.query('BEGIN');

      const locked = await client.query(`
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
              THEN COALESCE(
                wm.display_name_override,
                i.display_name
              )
            ELSE ss.display_name
          END AS sender_display_name,
          CASE
            WHEN m.sender_type = 'HUMAN'
              THEN i.primary_email
            ELSE NULL
          END AS sender_primary_email
        FROM ac_message m
        LEFT JOIN ac_workspace_member wm
          ON wm.workspace_id = m.workspace_id
         AND wm.workspace_member_id =
               m.sender_member_id
        LEFT JOIN ac_identity i
          ON i.identity_id = wm.identity_id
        LEFT JOIN ac_system_sender ss
          ON ss.workspace_id = m.workspace_id
         AND ss.system_sender_id =
               m.system_sender_id
        WHERE m.workspace_id = $1
          AND m.conversation_id = $2
          AND m.message_id = $3
        FOR UPDATE OF m
      `, [
        workspaceId,
        conversationId,
        messageId,
      ]);

      const row = locked.rows?.[0] || null;

      if (!row) {
        await client.query('COMMIT');
        return {
          status: 'NOT_FOUND',
          message: null,
        };
      }

      const current = materializeMessage(row);

      if (
        current.sender_type !== 'HUMAN' ||
        current.sender_member_id !== editorMemberId
      ) {
        await client.query('COMMIT');
        return {
          status: 'NOT_OWNER',
          message: null,
        };
      }

      if (current.message_type !== 'TEXT') {
        await client.query('COMMIT');
        return {
          status: 'NOT_TEXT',
          message: current,
        };
      }

      if (current.deleted_at) {
        await client.query('COMMIT');
        return {
          status: 'DELETED',
          message: current,
        };
      }

      if (current.body_text === bodyText && !Array.isArray(mentions)) {
        await client.query('COMMIT');
        return {
          status: 'UNCHANGED',
          message: current,
        };
      }

      const revisionResult =
        await client.query(`
          SELECT
            COALESCE(MAX(revision_no), 0) + 1
              AS next_revision_no
          FROM ac_message_revision
          WHERE workspace_id = $1
            AND message_id = $2
        `, [
          workspaceId,
          messageId,
        ]);

      const revisionNo =
        Number(
          revisionResult.rows?.[0]
            ?.next_revision_no || 1
        );

      const revisionId = randomUUID();

      const previousEncrypted =
        messageCrypto.encryptText(
          current.body_text || '',
          {
            recordType: 'REVISION',
            workspaceId,
            conversationId,
            recordId: revisionId,
          }
        );

      const nextEncrypted =
        messageCrypto.encryptText(
          bodyText,
          {
            recordType: 'MESSAGE',
            workspaceId,
            conversationId,
            recordId: messageId,
          }
        );

      await client.query(`
        INSERT INTO ac_message_revision (
          message_revision_id,
          workspace_id,
          message_id,
          revision_no,
          body_ciphertext,
          body_nonce,
          body_auth_tag,
          body_key_id,
          body_encryption_version,
          edited_by_member_id
        )
        VALUES (
          $1, $2, $3, $4,
          $5, $6, $7, $8, $9, $10
        )
      `, [
        revisionId,
        workspaceId,
        messageId,
        revisionNo,
        previousEncrypted.bodyCiphertext,
        previousEncrypted.bodyNonce,
        previousEncrypted.bodyAuthTag,
        previousEncrypted.bodyKeyId,
        previousEncrypted.bodyEncryptionVersion,
        editorMemberId,
      ]);

      await client.query(`
        UPDATE ac_message
        SET
          body_ciphertext = $1,
          body_nonce = $2,
          body_auth_tag = $3,
          body_key_id = $4,
          body_encryption_version = $5,
          edited_at = NOW()
        WHERE workspace_id = $6
          AND conversation_id = $7
          AND message_id = $8
      `, [
        nextEncrypted.bodyCiphertext,
        nextEncrypted.bodyNonce,
        nextEncrypted.bodyAuthTag,
        nextEncrypted.bodyKeyId,
        nextEncrypted.bodyEncryptionVersion,
        workspaceId,
        conversationId,
        messageId,
      ]);

      if (Array.isArray(mentions)) {
        await replaceMessageMentions(client, {
          workspaceId,
          conversationId,
          messageId,
          mentions,
        });
      }

      await client.query(`
        UPDATE ac_conversation
        SET updated_at = NOW()
        WHERE workspace_id = $1
          AND conversation_id = $2
      `, [
        workspaceId,
        conversationId,
      ]);

      await client.query('COMMIT');

      return {
        status: 'UPDATED',
        message: await messageDetails({
          workspaceId,
          conversationId,
          messageId,
        }),
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async function softDeleteHumanMessage({
    workspaceId,
    conversationId,
    messageId,
    senderMemberId,
  }) {
    const client = await db.connect();

    try {
      await client.query('BEGIN');

      const locked = await client.query(`
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
              THEN COALESCE(
                wm.display_name_override,
                i.display_name
              )
            ELSE ss.display_name
          END AS sender_display_name,
          CASE
            WHEN m.sender_type = 'HUMAN'
              THEN i.primary_email
            ELSE NULL
          END AS sender_primary_email
        FROM ac_message m
        LEFT JOIN ac_workspace_member wm
          ON wm.workspace_id = m.workspace_id
         AND wm.workspace_member_id =
               m.sender_member_id
        LEFT JOIN ac_identity i
          ON i.identity_id = wm.identity_id
        LEFT JOIN ac_system_sender ss
          ON ss.workspace_id = m.workspace_id
         AND ss.system_sender_id =
               m.system_sender_id
        WHERE m.workspace_id = $1
          AND m.conversation_id = $2
          AND m.message_id = $3
        FOR UPDATE OF m
      `, [
        workspaceId,
        conversationId,
        messageId,
      ]);

      const row = locked.rows?.[0] || null;

      if (!row) {
        await client.query('COMMIT');
        return {
          status: 'NOT_FOUND',
          message: null,
        };
      }

      const current = materializeMessage(row);

      if (
        current.sender_type !== 'HUMAN' ||
        current.sender_member_id !== senderMemberId
      ) {
        await client.query('COMMIT');
        return {
          status: 'NOT_OWNER',
          message: null,
        };
      }

      if (current.deleted_at) {
        await client.query('COMMIT');
        return {
          status: 'ALREADY_DELETED',
          message: current,
        };
      }

      await client.query(`
        UPDATE ac_message
        SET deleted_at = NOW()
        WHERE workspace_id = $1
          AND conversation_id = $2
          AND message_id = $3
      `, [
        workspaceId,
        conversationId,
        messageId,
      ]);

      await client.query(`
        UPDATE ac_conversation
        SET updated_at = NOW()
        WHERE workspace_id = $1
          AND conversation_id = $2
      `, [
        workspaceId,
        conversationId,
      ]);

      await client.query('COMMIT');

      return {
        status: 'DELETED',
        message: await messageDetails({
          workspaceId,
          conversationId,
          messageId,
        }),
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }



  async function decorateReactionSummaries({ workspaceId, workspaceMemberId, messages }) {
    const rows = (messages || []).filter(Boolean);
    const messageIds = rows.map((message) => message.message_id).filter(Boolean);
    if (!messageIds.length) return rows;

    const result = await db.query(`
      SELECT
        r.message_id,
        r.emoji,
        COUNT(*)::int AS reaction_count,
        BOOL_OR(r.workspace_member_id = $3::uuid) AS reacted_by_me
      FROM ac_message_reaction r
      WHERE r.workspace_id = $1
        AND r.message_id = ANY($2::uuid[])
      GROUP BY r.message_id, r.emoji
      ORDER BY r.message_id, r.emoji
    `, [workspaceId, messageIds, workspaceMemberId]);

    const byMessage = new Map();
    for (const row of result.rows || []) {
      if (!byMessage.has(row.message_id)) byMessage.set(row.message_id, []);
      byMessage.get(row.message_id).push({
        emoji: row.emoji,
        count: Number(row.reaction_count || 0),
        reacted_by_me: Boolean(row.reacted_by_me),
      });
    }

    return rows.map((message) => ({
      ...message,
      reactions: byMessage.get(message.message_id) || [],
    }));
  }

  async function searchConversationMessages({
    workspaceId,
    conversationId,
    workspaceMemberId,
    query,
    limit,
  }) {
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
        m.quote_message_id,
        m.created_at,
        m.edited_at,
        m.deleted_at,
        CASE
          WHEN m.sender_type = 'HUMAN'
            THEN COALESCE(wm.display_name_override, i.display_name)
          ELSE ss.display_name
        END AS sender_display_name,
        CASE WHEN m.sender_type = 'HUMAN' THEN i.primary_email ELSE NULL END
          AS sender_primary_email
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
        AND m.deleted_at IS NULL
      ORDER BY m.created_at DESC, m.message_id DESC
      LIMIT 2000
    `, [workspaceId, conversationId]);

    const needle = String(query || '').trim().toLocaleLowerCase();
    const matched = [];
    for (const row of result.rows || []) {
      const message = materializeMessage(row);
      const haystack = [message.body_text, message.sender_display_name]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase();
      if (!needle || !haystack.includes(needle)) continue;
      matched.push(message);
      if (matched.length >= limit) break;
    }

    const withReactions = await decorateReactionSummaries({
      workspaceId,
      workspaceMemberId,
      messages: await hydrateQuotedMessages({
        workspaceId,
        conversationId,
        messages: matched,
      }),
    });

    return decorateMentions({
      workspaceId,
      messages: withReactions,
    });
  }

  async function toggleMessageReaction({
    workspaceId,
    conversationId,
    messageId,
    workspaceMemberId,
    emoji,
  }) {
    const existing = await db.query(`
      SELECT emoji
      FROM ac_message_reaction
      WHERE workspace_id = $1
        AND conversation_id = $2
        AND message_id = $3
        AND workspace_member_id = $4
      LIMIT 1
    `, [workspaceId, conversationId, messageId, workspaceMemberId]);

    const current = existing.rows?.[0]?.emoji || null;
    if (current === emoji) {
      await db.query(`
        DELETE FROM ac_message_reaction
        WHERE workspace_id = $1
          AND conversation_id = $2
          AND message_id = $3
          AND workspace_member_id = $4
      `, [workspaceId, conversationId, messageId, workspaceMemberId]);
    } else {
      await db.query(`
        INSERT INTO ac_message_reaction (
          workspace_id, conversation_id, message_id, workspace_member_id, emoji, created_at
        )
        VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (workspace_id, conversation_id, message_id, workspace_member_id)
        DO UPDATE SET emoji = EXCLUDED.emoji, created_at = NOW()
      `, [workspaceId, conversationId, messageId, workspaceMemberId, emoji]);
    }

    const [decorated] = await decorateReactionSummaries({
      workspaceId,
      workspaceMemberId,
      messages: [{ message_id: messageId }],
    });
    return decorated?.reactions || [];
  }

  async function listMessageReactionUsers({
    workspaceId,
    conversationId,
    messageId,
  }) {
    const result = await db.query(`
      SELECT
        r.emoji,
        r.workspace_member_id,
        COALESCE(wm.display_name_override, i.display_name) AS display_name,
        r.created_at
      FROM ac_message_reaction r
      JOIN ac_workspace_member wm
        ON wm.workspace_id = r.workspace_id
       AND wm.workspace_member_id = r.workspace_member_id
      JOIN ac_identity i ON i.identity_id = wm.identity_id
      WHERE r.workspace_id = $1
        AND r.conversation_id = $2
        AND r.message_id = $3
      ORDER BY r.emoji, COALESCE(wm.display_name_override, i.display_name)
    `, [workspaceId, conversationId, messageId]);
    return result.rows || [];
  }

  async function listMessages({ workspaceId, conversationId, workspaceMemberId, limit, beforeMessageId }) {
    let cursor = null;
    if (beforeMessageId) {
      const cursorResult = await db.query(`
        SELECT message_id, created_at
        FROM ac_message
        WHERE workspace_id = $1
          AND conversation_id = $2
          AND message_id = $3
          AND reply_to_message_id IS NULL
        LIMIT 1
      `, [workspaceId, conversationId, beforeMessageId]);
      cursor = cursorResult.rows?.[0] || null;
      if (!cursor) return { cursorInvalid: true, rows: [], hasMore: false, nextBeforeMessageId: null };
    }

    const params = [
      workspaceId,
      conversationId,
      limit + 1,
      cursor?.created_at || null,
      cursor?.message_id || null,
      workspaceMemberId,
    ];
    const cursorClause = cursor
      ? `AND (m.created_at, m.message_id) < ($4::timestamptz, $5::uuid)`
      : `AND $4::timestamptz IS NULL
         AND $5::uuid IS NULL`;

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
        m.quote_message_id,
        m.created_at,
        m.edited_at,
        m.deleted_at,
        (
          SELECT COUNT(*)::int
          FROM ac_message tr
          WHERE tr.workspace_id = m.workspace_id
            AND tr.conversation_id = m.conversation_id
            AND tr.reply_to_message_id = m.message_id
        ) AS thread_reply_count,
        (
          SELECT tr.created_at
          FROM ac_message tr
          WHERE tr.workspace_id = m.workspace_id
            AND tr.conversation_id = m.conversation_id
            AND tr.reply_to_message_id = m.message_id
          ORDER BY tr.created_at DESC, tr.message_id DESC
          LIMIT 1
        ) AS thread_last_reply_at,
        (
          SELECT tr.message_id
          FROM ac_message tr
          WHERE tr.workspace_id = m.workspace_id
            AND tr.conversation_id = m.conversation_id
            AND tr.reply_to_message_id = m.message_id
          ORDER BY tr.created_at DESC, tr.message_id DESC
          LIMIT 1
        ) AS thread_last_reply_message_id,
        (
          SELECT COUNT(*)::int
          FROM ac_read_cursor rc
          JOIN ac_message cursor_message
            ON cursor_message.workspace_id = rc.workspace_id
           AND cursor_message.conversation_id = rc.conversation_id
           AND cursor_message.message_id = rc.last_read_message_id
          WHERE rc.workspace_id = m.workspace_id
            AND rc.conversation_id = m.conversation_id
            AND rc.workspace_member_id IS DISTINCT FROM m.sender_member_id
            AND (cursor_message.created_at, cursor_message.message_id)
                  >= (m.created_at, m.message_id)
        ) AS read_by_count,
        (
          SELECT COUNT(*)::int
          FROM ac_message tr
          LEFT JOIN ac_thread_read_cursor trc
            ON trc.workspace_id = tr.workspace_id
           AND trc.conversation_id = tr.conversation_id
           AND trc.thread_root_message_id = m.message_id
           AND trc.workspace_member_id = $6
          LEFT JOIN ac_message cursor_reply
            ON cursor_reply.workspace_id = trc.workspace_id
           AND cursor_reply.conversation_id = trc.conversation_id
           AND cursor_reply.message_id = trc.last_read_message_id
          WHERE tr.workspace_id = m.workspace_id
            AND tr.conversation_id = m.conversation_id
            AND tr.reply_to_message_id = m.message_id
            AND tr.deleted_at IS NULL
            AND (tr.sender_type <> 'HUMAN' OR tr.sender_member_id IS DISTINCT FROM $6::uuid)
            AND (
              trc.last_read_message_id IS NULL
              OR (tr.created_at, tr.message_id) >
                 (cursor_reply.created_at, cursor_reply.message_id)
            )
        ) AS thread_unread_count,
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
        AND m.reply_to_message_id IS NULL
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

    const rowsWithReactions = await decorateReactionSummaries({
      workspaceId,
      workspaceMemberId,
      messages: await hydrateQuotedMessages({
        workspaceId,
        conversationId,
        messages:
          pageDescending
            .reverse()
            .map(materializeMessage),
      }),
    });

    const rows = await decorateMentions({
      workspaceId,
      messages: rowsWithReactions,
    });

    return {
      cursorInvalid: false,
      rows,
      hasMore,
      nextBeforeMessageId,
    };
  }

  async function listThread({ workspaceId, conversationId, parentMessageId, workspaceMemberId }) {
    const parent = await messageDetails({
      workspaceId,
      conversationId,
      messageId: parentMessageId,
    });

    if (!parent || parent.reply_to_message_id) {
      return null;
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
        m.quote_message_id,
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
        END AS sender_primary_email,
        (
          SELECT COUNT(*)::int
          FROM ac_thread_read_cursor trc
          JOIN ac_message cursor_reply
            ON cursor_reply.workspace_id = trc.workspace_id
           AND cursor_reply.conversation_id = trc.conversation_id
           AND cursor_reply.message_id = trc.last_read_message_id
          WHERE trc.workspace_id = m.workspace_id
            AND trc.conversation_id = m.conversation_id
            AND trc.thread_root_message_id = $3
            AND trc.workspace_member_id IS DISTINCT FROM m.sender_member_id
            AND (cursor_reply.created_at, cursor_reply.message_id)
                  >= (m.created_at, m.message_id)
        ) AS read_by_count
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
        AND m.reply_to_message_id = $3
      ORDER BY m.created_at, m.message_id
    `, [workspaceId, conversationId, parentMessageId]);

    const repliesWithReactions =
      await decorateReactionSummaries({
        workspaceId,
        workspaceMemberId,
        messages: await hydrateQuotedMessages({
          workspaceId,
          conversationId,
          messages:
            (result.rows || [])
              .map(materializeMessage),
        }),
      });

    const replies = await decorateMentions({
      workspaceId,
      messages: repliesWithReactions,
    });

    return {
      parent,
      replies,
      thread_read_cursor: await getThreadReadCursor({
        workspaceId,
        conversationId,
        parentMessageId,
        workspaceMemberId,
      }),
    };
  }

  async function getThreadReadCursor({
    workspaceId,
    conversationId,
    parentMessageId,
    workspaceMemberId,
  }) {
    const result = await db.query(`
      SELECT
        workspace_id,
        conversation_id,
        thread_root_message_id,
        workspace_member_id,
        last_read_message_id,
        read_at
      FROM ac_thread_read_cursor
      WHERE workspace_id = $1
        AND conversation_id = $2
        AND thread_root_message_id = $3
        AND workspace_member_id = $4
      LIMIT 1
    `, [workspaceId, conversationId, parentMessageId, workspaceMemberId]);

    return result.rows?.[0] || null;
  }

  async function advanceThreadReadCursor({
    workspaceId,
    conversationId,
    parentMessageId,
    workspaceMemberId,
    lastReadMessageId,
  }) {
    const result = await db.query(`
      INSERT INTO ac_thread_read_cursor (
        workspace_id, conversation_id, thread_root_message_id,
        workspace_member_id, last_read_message_id, read_at
      )
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (
        workspace_id, conversation_id, thread_root_message_id, workspace_member_id
      )
      DO UPDATE SET
        last_read_message_id = EXCLUDED.last_read_message_id,
        read_at = NOW()
      WHERE ac_thread_read_cursor.last_read_message_id IS NULL
         OR EXISTS (
            SELECT 1
            FROM ac_message current_message
            JOIN ac_message candidate_message
              ON candidate_message.workspace_id = current_message.workspace_id
             AND candidate_message.conversation_id = current_message.conversation_id
            WHERE current_message.workspace_id = ac_thread_read_cursor.workspace_id
              AND current_message.conversation_id = ac_thread_read_cursor.conversation_id
              AND current_message.message_id = ac_thread_read_cursor.last_read_message_id
              AND candidate_message.message_id = EXCLUDED.last_read_message_id
              AND candidate_message.reply_to_message_id = ac_thread_read_cursor.thread_root_message_id
              AND (current_message.created_at, current_message.message_id)
                    <= (candidate_message.created_at, candidate_message.message_id)
         )
      RETURNING
        workspace_id, conversation_id, thread_root_message_id,
        workspace_member_id, last_read_message_id, read_at
    `, [workspaceId, conversationId, parentMessageId, workspaceMemberId, lastReadMessageId]);

    if (result.rows?.[0]) return { ...result.rows[0], advanced: true };

    const current = await getThreadReadCursor({
      workspaceId, conversationId, parentMessageId, workspaceMemberId,
    });
    return current ? { ...current, advanced: false } : null;
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
              AND cm.workspace_member_id IS NOT NULL
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
       AND m.reply_to_message_id IS NULL
      GROUP BY ac.conversation_id
      ORDER BY ac.conversation_id
    `, [workspaceId, workspaceMemberId]);

    return result.rows || [];
  }

  async function getMemberPresenceProfile({ workspaceId, workspaceMemberId }) {
    const result = await db.query(`
      SELECT
        workspace_id,
        workspace_member_id,
        CASE
          WHEN status_expires_at IS NOT NULL AND status_expires_at <= NOW()
            THEN NULL
          ELSE custom_status
        END AS custom_status,
        CASE
          WHEN status_expires_at IS NOT NULL AND status_expires_at <= NOW()
            THEN NULL
          ELSE status_expires_at
        END AS status_expires_at,
        last_seen_at,
        updated_at
      FROM ac_member_presence_profile
      WHERE workspace_id = $1
        AND workspace_member_id = $2
      LIMIT 1
    `, [workspaceId, workspaceMemberId]);

    return result.rows?.[0] || {
      workspace_id: workspaceId,
      workspace_member_id: workspaceMemberId,
      custom_status: null,
      status_expires_at: null,
      last_seen_at: null,
      updated_at: null,
    };
  }

  async function listMemberPresenceProfiles({ workspaceId, workspaceMemberIds }) {
    const ids = Array.isArray(workspaceMemberIds)
      ? [...new Set(workspaceMemberIds.filter(Boolean))]
      : [];
    if (!ids.length) return [];

    const result = await db.query(`
      SELECT
        requested.workspace_member_id,
        CASE
          WHEN p.status_expires_at IS NOT NULL AND p.status_expires_at <= NOW()
            THEN NULL
          ELSE p.custom_status
        END AS custom_status,
        CASE
          WHEN p.status_expires_at IS NOT NULL AND p.status_expires_at <= NOW()
            THEN NULL
          ELSE p.status_expires_at
        END AS status_expires_at,
        p.last_seen_at,
        p.updated_at
      FROM unnest($2::uuid[]) AS requested(workspace_member_id)
      LEFT JOIN ac_member_presence_profile p
        ON p.workspace_id = $1
       AND p.workspace_member_id = requested.workspace_member_id
      ORDER BY requested.workspace_member_id
    `, [workspaceId, ids]);

    return result.rows || [];
  }

  async function updateMemberPresenceProfile({
    workspaceId,
    workspaceMemberId,
    customStatus,
    statusExpiresAt,
  }) {
    const result = await db.query(`
      INSERT INTO ac_member_presence_profile (
        workspace_id,
        workspace_member_id,
        custom_status,
        status_expires_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (workspace_id, workspace_member_id)
      DO UPDATE SET
        custom_status = EXCLUDED.custom_status,
        status_expires_at = EXCLUDED.status_expires_at,
        updated_at = NOW()
      RETURNING
        workspace_id,
        workspace_member_id,
        custom_status,
        status_expires_at,
        last_seen_at,
        updated_at
    `, [workspaceId, workspaceMemberId, customStatus || null, statusExpiresAt || null]);

    return result.rows?.[0] || null;
  }

  async function touchMemberLastSeen({ workspaceId, workspaceMemberId }) {
    const result = await db.query(`
      INSERT INTO ac_member_presence_profile (
        workspace_id,
        workspace_member_id,
        last_seen_at,
        updated_at
      )
      VALUES ($1, $2, NOW(), NOW())
      ON CONFLICT (workspace_id, workspace_member_id)
      DO UPDATE SET
        last_seen_at = NOW(),
        updated_at = NOW()
      RETURNING
        workspace_id,
        workspace_member_id,
        custom_status,
        status_expires_at,
        last_seen_at,
        updated_at
    `, [workspaceId, workspaceMemberId]);

    return result.rows?.[0] || null;
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
        JOIN ac_channel_member cm
          ON cm.workspace_id = ch.workspace_id
         AND cm.channel_id = ch.channel_id
         AND cm.left_at IS NULL
        JOIN ac_workspace_member wm
          ON wm.workspace_id = cm.workspace_id
         AND wm.workspace_member_id = cm.workspace_member_id
         AND wm.status = 'ACTIVE'
        JOIN ac_identity i
          ON i.identity_id = wm.identity_id
         AND i.status = 'ACTIVE'
        WHERE conv.workspace_id = $1
          AND conv.conversation_id = $2
          AND conv.status = 'ACTIVE'
          AND conv.conversation_type = 'CHANNEL'

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
    getMessagePreviews,
    findHumanMessageByClientId,
    createHumanMessage,
    updateHumanTextMessage,
    softDeleteHumanMessage,
    listMessages,
    searchConversationMessages,
    toggleMessageReaction,
    listMessageReactionUsers,
    listThread,
    getThreadReadCursor,
    advanceThreadReadCursor,
    getReadCursor,
    advanceReadCursor,
    getActiveSystemSender,
    findSystemMessageBySourceEvent,
    createSystemMessage,
    listUnreadCounts,
    getMemberPresenceProfile,
    listMemberPresenceProfiles,
    updateMemberPresenceProfile,
    touchMemberLastSeen,
    listConversationRecipientMemberIds,
    getMentionMemberTarget,
    getAccessibleChannelReference,
    listMentionCandidates,
  });
}

module.exports = { createMessagingRepository };
