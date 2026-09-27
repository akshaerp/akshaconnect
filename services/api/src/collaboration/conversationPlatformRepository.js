'use strict';

function clean(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function createConversationPlatformRepository(
  db,
  {
    messageCrypto,
  } = {}
) {
  if (!db || typeof db.query !== 'function' || typeof db.connect !== 'function') {
    throw new TypeError('A PostgreSQL pool is required');
  }

  if (!messageCrypto || typeof messageCrypto.decryptText !== 'function') {
    throw new TypeError('Message crypto is required');
  }

  function decryptMessage(row) {
    if (!row) return '';

    try {
      return messageCrypto.decryptText({
        body_ciphertext: row.body_ciphertext,
        body_nonce: row.body_nonce,
        body_auth_tag: row.body_auth_tag,
        body_key_id: row.body_key_id,
        body_encryption_version: row.body_encryption_version,
      }, {
        recordType: 'MESSAGE',
        workspaceId: row.workspace_id,
        conversationId: row.conversation_id,
        recordId: row.message_id,
      }) || '';
    } catch {
      return '';
    }
  }

  async function getConversationContext({
    workspaceId,
    conversationId,
    requesterMemberId,
  }) {
    const result = await db.query(`
      SELECT
        conv.conversation_id,
        conv.conversation_type,
        conv.status AS conversation_status,
        conv.created_at AS conversation_created_at,
        conv.created_by_member_id,

        requester.member_role AS requester_workspace_role,
        requester.status AS requester_workspace_status,

        ch.channel_id,
        ch.channel_code,
        ch.channel_name,
        ch.visibility,
        ch.description,
        ch.topic,
        ch.status AS channel_status,

        channel_membership.member_role AS requester_channel_role,
        (channel_membership.workspace_member_id IS NOT NULL) AS requester_is_channel_member,
        (participant.workspace_member_id IS NOT NULL) AS requester_is_participant,

        creator_display.display_name AS creator_display_name,

        peer.workspace_member_id AS peer_workspace_member_id,
        peer_identity.identity_id AS peer_identity_id,
        COALESCE(peer.display_name_override, peer_identity.display_name) AS peer_display_name,
        peer_identity.primary_email AS peer_primary_email
      FROM public.ac_conversation conv
      JOIN public.ac_workspace_member requester
        ON requester.workspace_id = conv.workspace_id
       AND requester.workspace_member_id = $3
      LEFT JOIN public.ac_channel ch
        ON ch.workspace_id = conv.workspace_id
       AND ch.conversation_id = conv.conversation_id
      LEFT JOIN public.ac_channel_member channel_membership
        ON channel_membership.workspace_id = ch.workspace_id
       AND channel_membership.channel_id = ch.channel_id
       AND channel_membership.workspace_member_id = $3
       AND channel_membership.left_at IS NULL
      LEFT JOIN public.ac_conversation_participant participant
        ON participant.workspace_id = conv.workspace_id
       AND participant.conversation_id = conv.conversation_id
       AND participant.workspace_member_id = $3
       AND participant.left_at IS NULL
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(wm.display_name_override, i.display_name) AS display_name
        FROM public.ac_workspace_member wm
        JOIN public.ac_identity i
          ON i.identity_id = wm.identity_id
        WHERE wm.workspace_id = conv.workspace_id
          AND wm.workspace_member_id = conv.created_by_member_id
        LIMIT 1
      ) creator_display ON TRUE
      LEFT JOIN public.ac_direct_message dm
        ON dm.workspace_id = conv.workspace_id
       AND dm.conversation_id = conv.conversation_id
      LEFT JOIN public.ac_workspace_member peer
        ON peer.workspace_id = conv.workspace_id
       AND peer.workspace_member_id = CASE
          WHEN dm.member_a_id = $3 THEN dm.member_b_id
          WHEN dm.member_b_id = $3 THEN dm.member_a_id
          ELSE NULL
       END
      LEFT JOIN public.ac_identity peer_identity
        ON peer_identity.identity_id = peer.identity_id
      WHERE conv.workspace_id = $1
        AND conv.conversation_id = $2
        AND conv.status = 'ACTIVE'
      LIMIT 1
    `, [workspaceId, conversationId, requesterMemberId]);

    return result.rows?.[0] || null;
  }

  async function updateChannelProfile({
    workspaceId,
    conversationId,
    channelName,
    description,
    topic,
  }) {
    const result = await db.query(`
      UPDATE public.ac_channel
      SET
        channel_name = $3,
        description = $4,
        topic = $5,
        updated_at = NOW()
      WHERE workspace_id = $1
        AND conversation_id = $2
        AND status = 'ACTIVE'
      RETURNING
        channel_id,
        conversation_id,
        channel_code,
        channel_name,
        visibility,
        description,
        topic,
        created_by_member_id,
        created_at,
        updated_at
    `, [
      workspaceId,
      conversationId,
      channelName,
      description || null,
      topic || null,
    ]);

    if (result.rows?.[0]) {
      await db.query(`
        UPDATE public.ac_conversation
        SET title = $3,
            updated_at = NOW()
        WHERE workspace_id = $1
          AND conversation_id = $2
      `, [workspaceId, conversationId, channelName]);
    }

    return result.rows?.[0] || null;
  }

  async function listChannelRules({
    workspaceId,
    conversationId,
  }) {
    const result = await db.query(`
      SELECT
        r.channel_rule_id,
        r.rule_text,
        r.sequence_no,
        r.created_by_member_id,
        r.created_at,
        r.updated_at
      FROM public.ac_channel c
      JOIN public.ac_channel_rule r
        ON r.workspace_id = c.workspace_id
       AND r.channel_id = c.channel_id
       AND r.status = 'ACTIVE'
      WHERE c.workspace_id = $1
        AND c.conversation_id = $2
        AND c.status = 'ACTIVE'
      ORDER BY r.sequence_no, r.created_at, r.channel_rule_id
    `, [workspaceId, conversationId]);

    return result.rows || [];
  }

  async function replaceChannelRules({
    workspaceId,
    conversationId,
    actorMemberId,
    rules,
  }) {
    const client = await db.connect();

    try {
      await client.query('BEGIN');

      const channelResult = await client.query(`
        SELECT channel_id
        FROM public.ac_channel
        WHERE workspace_id = $1
          AND conversation_id = $2
          AND status = 'ACTIVE'
        LIMIT 1
        FOR UPDATE
      `, [workspaceId, conversationId]);

      const channelId = channelResult.rows?.[0]?.channel_id;
      if (!channelId) {
        await client.query('ROLLBACK');
        return null;
      }

      await client.query(`
        UPDATE public.ac_channel_rule
        SET status = 'INACTIVE',
            updated_at = NOW()
        WHERE workspace_id = $1
          AND channel_id = $2
          AND status = 'ACTIVE'
      `, [workspaceId, channelId]);

      for (let index = 0; index < rules.length; index += 1) {
        await client.query(`
          INSERT INTO public.ac_channel_rule (
            workspace_id,
            channel_id,
            rule_text,
            sequence_no,
            status,
            created_by_member_id
          )
          VALUES ($1, $2, $3, $4, 'ACTIVE', $5)
        `, [
          workspaceId,
          channelId,
          rules[index],
          index + 1,
          actorMemberId,
        ]);
      }

      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async function listConversationPins({
    workspaceId,
    conversationId,
  }) {
    const result = await db.query(`
      SELECT
        p.conversation_pin_id,
        p.message_id,
        p.pinned_by_member_id,
        p.pinned_at,
        COALESCE(pinner.display_name_override, pinner_identity.display_name) AS pinned_by_display_name,

        m.workspace_id,
        m.conversation_id,
        m.sender_type,
        m.sender_member_id,
        m.message_type,
        m.body_ciphertext,
        m.body_nonce,
        m.body_auth_tag,
        m.body_key_id,
        m.body_encryption_version,
        m.created_at AS message_created_at,
        m.deleted_at,

        COALESCE(sender.display_name_override, sender_identity.display_name) AS sender_display_name,

        a.attachment_id,
        a.content_type,
        a.size_bytes
      FROM public.ac_conversation_pin p
      JOIN public.ac_message m
        ON m.workspace_id = p.workspace_id
       AND m.conversation_id = p.conversation_id
       AND m.message_id = p.message_id
      LEFT JOIN public.ac_workspace_member pinner
        ON pinner.workspace_id = p.workspace_id
       AND pinner.workspace_member_id = p.pinned_by_member_id
      LEFT JOIN public.ac_identity pinner_identity
        ON pinner_identity.identity_id = pinner.identity_id
      LEFT JOIN public.ac_workspace_member sender
        ON sender.workspace_id = m.workspace_id
       AND sender.workspace_member_id = m.sender_member_id
      LEFT JOIN public.ac_identity sender_identity
        ON sender_identity.identity_id = sender.identity_id
      LEFT JOIN public.ac_attachment a
        ON a.workspace_id = m.workspace_id
       AND a.conversation_id = m.conversation_id
       AND a.message_id = m.message_id
      WHERE p.workspace_id = $1
        AND p.conversation_id = $2
      ORDER BY p.pinned_at DESC, p.conversation_pin_id
    `, [workspaceId, conversationId]);

    return (result.rows || []).map((row) => ({
      conversation_pin_id: row.conversation_pin_id,
      message_id: row.message_id,
      pinned_by_member_id: row.pinned_by_member_id,
      pinned_by_display_name: row.pinned_by_display_name,
      pinned_at: row.pinned_at,
      message_type: row.message_type,
      message_created_at: row.message_created_at,
      sender_display_name: row.sender_display_name,
      deleted: Boolean(row.deleted_at),
      body_text: row.deleted_at ? '' : decryptMessage(row),
      attachment: row.attachment_id
        ? {
            attachment_id: row.attachment_id,
            message_id: row.message_id,
            file_name: row.deleted_at ? 'Deleted attachment' : decryptMessage(row),
            content_type: row.content_type,
            size_bytes: Number(row.size_bytes || 0),
          }
        : null,
    }));
  }

  async function listRecentPinCandidates({
    workspaceId,
    conversationId,
    limit = 30,
  }) {
    const result = await db.query(`
      SELECT
        m.workspace_id,
        m.conversation_id,
        m.message_id,
        m.sender_type,
        m.sender_member_id,
        m.message_type,
        m.body_ciphertext,
        m.body_nonce,
        m.body_auth_tag,
        m.body_key_id,
        m.body_encryption_version,
        m.created_at,
        COALESCE(sender.display_name_override, sender_identity.display_name) AS sender_display_name,
        (p.conversation_pin_id IS NOT NULL) AS is_pinned
      FROM public.ac_message m
      LEFT JOIN public.ac_workspace_member sender
        ON sender.workspace_id = m.workspace_id
       AND sender.workspace_member_id = m.sender_member_id
      LEFT JOIN public.ac_identity sender_identity
        ON sender_identity.identity_id = sender.identity_id
      LEFT JOIN public.ac_conversation_pin p
        ON p.workspace_id = m.workspace_id
       AND p.conversation_id = m.conversation_id
       AND p.message_id = m.message_id
      WHERE m.workspace_id = $1
        AND m.conversation_id = $2
        AND m.deleted_at IS NULL
      ORDER BY m.created_at DESC, m.message_id DESC
      LIMIT $3
    `, [workspaceId, conversationId, limit]);

    return (result.rows || []).map((row) => ({
      message_id: row.message_id,
      message_type: row.message_type,
      created_at: row.created_at,
      sender_display_name: row.sender_display_name,
      body_text: decryptMessage(row),
      is_pinned: Boolean(row.is_pinned),
    }));
  }

  async function addConversationPin({
    workspaceId,
    conversationId,
    messageId,
    actorMemberId,
  }) {
    const result = await db.query(`
      INSERT INTO public.ac_conversation_pin (
        workspace_id,
        conversation_id,
        message_id,
        pinned_by_member_id
      )
      SELECT
        $1,
        $2,
        m.message_id,
        $4
      FROM public.ac_message m
      WHERE m.workspace_id = $1
        AND m.conversation_id = $2
        AND m.message_id = $3
        AND m.deleted_at IS NULL
      ON CONFLICT (
        workspace_id,
        conversation_id,
        message_id
      )
      DO UPDATE SET
        pinned_by_member_id = EXCLUDED.pinned_by_member_id,
        pinned_at = NOW()
      RETURNING
        conversation_pin_id,
        message_id,
        pinned_by_member_id,
        pinned_at
    `, [
      workspaceId,
      conversationId,
      messageId,
      actorMemberId,
    ]);

    return result.rows?.[0] || null;
  }

  async function removeConversationPin({
    workspaceId,
    conversationId,
    messageId,
  }) {
    const result = await db.query(`
      DELETE FROM public.ac_conversation_pin
      WHERE workspace_id = $1
        AND conversation_id = $2
        AND message_id = $3
      RETURNING conversation_pin_id
    `, [workspaceId, conversationId, messageId]);

    return Boolean(result.rows?.[0]);
  }

  async function getConversationSetting({
    workspaceId,
    conversationId,
    workspaceMemberId,
  }) {
    const result = await db.query(`
      SELECT
        notification_level,
        muted_until,
        updated_at
      FROM public.ac_conversation_member_setting
      WHERE workspace_id = $1
        AND conversation_id = $2
        AND workspace_member_id = $3
      LIMIT 1
    `, [workspaceId, conversationId, workspaceMemberId]);

    return result.rows?.[0] || {
      notification_level: 'ALL',
      muted_until: null,
      updated_at: null,
    };
  }

  async function upsertConversationSetting({
    workspaceId,
    conversationId,
    workspaceMemberId,
    notificationLevel,
    mutedUntil,
  }) {
    const result = await db.query(`
      INSERT INTO public.ac_conversation_member_setting (
        workspace_id,
        conversation_id,
        workspace_member_id,
        notification_level,
        muted_until,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (
        workspace_id,
        conversation_id,
        workspace_member_id
      )
      DO UPDATE SET
        notification_level = EXCLUDED.notification_level,
        muted_until = EXCLUDED.muted_until,
        updated_at = NOW()
      RETURNING
        notification_level,
        muted_until,
        updated_at
    `, [
      workspaceId,
      conversationId,
      workspaceMemberId,
      notificationLevel,
      mutedUntil || null,
    ]);

    return result.rows[0];
  }

  async function listSharedAttachments({
    workspaceId,
    conversationId,
    limit = 200,
  }) {
    const result = await db.query(`
      SELECT
        a.attachment_id,
        a.message_id,
        a.content_type,
        a.size_bytes,
        a.created_at,
        a.workspace_id,
        a.conversation_id,

        m.body_ciphertext,
        m.body_nonce,
        m.body_auth_tag,
        m.body_key_id,
        m.body_encryption_version,

        COALESCE(sender.display_name_override, sender_identity.display_name) AS sender_display_name
      FROM public.ac_attachment a
      JOIN public.ac_message m
        ON m.workspace_id = a.workspace_id
       AND m.conversation_id = a.conversation_id
       AND m.message_id = a.message_id
       AND m.deleted_at IS NULL
      LEFT JOIN public.ac_workspace_member sender
        ON sender.workspace_id = m.workspace_id
       AND sender.workspace_member_id = m.sender_member_id
      LEFT JOIN public.ac_identity sender_identity
        ON sender_identity.identity_id = sender.identity_id
      WHERE a.workspace_id = $1
        AND a.conversation_id = $2
      ORDER BY a.created_at DESC, a.attachment_id DESC
      LIMIT $3
    `, [workspaceId, conversationId, limit]);

    return (result.rows || []).map((row) => ({
      attachment_id: row.attachment_id,
      message_id: row.message_id,
      file_name: decryptMessage(row) || 'attachment',
      content_type: row.content_type,
      size_bytes: Number(row.size_bytes || 0),
      created_at: row.created_at,
      sender_display_name: row.sender_display_name,
      shared_kind:
        String(row.content_type || '').startsWith('image/') ||
        String(row.content_type || '').startsWith('video/')
          ? 'MEDIA'
          : 'FILES',
    }));
  }

  async function listSharedLinks({
    workspaceId,
    conversationId,
    messageLimit = 400,
  }) {
    const result = await db.query(`
      SELECT
        m.workspace_id,
        m.conversation_id,
        m.message_id,
        m.body_ciphertext,
        m.body_nonce,
        m.body_auth_tag,
        m.body_key_id,
        m.body_encryption_version,
        m.created_at,
        COALESCE(sender.display_name_override, sender_identity.display_name) AS sender_display_name
      FROM public.ac_message m
      LEFT JOIN public.ac_workspace_member sender
        ON sender.workspace_id = m.workspace_id
       AND sender.workspace_member_id = m.sender_member_id
      LEFT JOIN public.ac_identity sender_identity
        ON sender_identity.identity_id = sender.identity_id
      WHERE m.workspace_id = $1
        AND m.conversation_id = $2
        AND m.message_type = 'TEXT'
        AND m.deleted_at IS NULL
      ORDER BY m.created_at DESC, m.message_id DESC
      LIMIT $3
    `, [workspaceId, conversationId, messageLimit]);

    const links = [];
    const seen = new Set();

    for (const row of result.rows || []) {
      const body = decryptMessage(row);
      const matches = body.match(/https?:\/\/[^\s<>"')\]]+/gi) || [];

      for (const raw of matches) {
        const url = clean(raw).replace(/[.,;:!?]+$/, '');
        const key = `${row.message_id}|${url}`;
        if (!url || seen.has(key)) continue;
        seen.add(key);

        links.push({
          message_id: row.message_id,
          url,
          created_at: row.created_at,
          sender_display_name: row.sender_display_name,
        });

        if (links.length >= 200) return links;
      }
    }

    return links;
  }

  async function filterPushRecipients({
    workspaceId,
    conversationId,
    workspaceMemberIds,
  }) {
    if (!Array.isArray(workspaceMemberIds) || workspaceMemberIds.length === 0) {
      return [];
    }

    const result = await db.query(`
      SELECT workspace_member_id
      FROM public.ac_conversation_member_setting
      WHERE workspace_id = $1
        AND conversation_id = $2
        AND workspace_member_id = ANY($3::uuid[])
        AND (
          notification_level = 'NONE'
          OR (
            muted_until IS NOT NULL
            AND muted_until > NOW()
          )
        )
    `, [workspaceId, conversationId, workspaceMemberIds]);

    const blocked = new Set(
      (result.rows || []).map((row) => row.workspace_member_id)
    );

    return workspaceMemberIds.filter((memberId) => !blocked.has(memberId));
  }

  return Object.freeze({
    getConversationContext,
    updateChannelProfile,
    listChannelRules,
    replaceChannelRules,
    listConversationPins,
    listRecentPinCandidates,
    addConversationPin,
    removeConversationPin,
    getConversationSetting,
    upsertConversationSetting,
    listSharedAttachments,
    listSharedLinks,
    filterPushRecipients,
  });
}

module.exports = {
  createConversationPlatformRepository,
};
