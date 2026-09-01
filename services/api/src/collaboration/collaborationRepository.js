'use strict';

function createCollaborationRepository(db) {
  if (!db || typeof db.query !== 'function' || typeof db.connect !== 'function') {
    throw new TypeError('A PostgreSQL pool is required');
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
      JOIN ac_identity i
        ON i.identity_id = wm.identity_id
      WHERE wm.workspace_id = $1
        AND wm.workspace_member_id = $2
        AND wm.status = 'ACTIVE'
      LIMIT 1
    `, [workspaceId, workspaceMemberId]);

    return result.rows?.[0] || null;
  }

  async function listChannels({ workspaceId, requesterMemberId }) {
    const result = await db.query(`
      SELECT
        c.channel_id,
        c.conversation_id,
        c.channel_code,
        c.channel_name,
        c.visibility,
        c.status,
        c.created_by_member_id,
        c.created_at,
        c.updated_at,
        (cm.workspace_member_id IS NOT NULL) AS is_member,
        cm.member_role
      FROM ac_channel c
      JOIN ac_conversation conv
        ON conv.workspace_id = c.workspace_id
       AND conv.conversation_id = c.conversation_id
      LEFT JOIN ac_channel_member cm
        ON cm.workspace_id = c.workspace_id
       AND cm.channel_id = c.channel_id
       AND cm.workspace_member_id = $2
       AND cm.left_at IS NULL
      WHERE c.workspace_id = $1
        AND c.status = 'ACTIVE'
        AND conv.status = 'ACTIVE'
        AND (
          c.visibility = 'PUBLIC'
          OR cm.workspace_member_id IS NOT NULL
        )
      ORDER BY LOWER(c.channel_name), c.channel_id
    `, [workspaceId, requesterMemberId]);

    return result.rows;
  }

  async function createChannel({
    workspaceId,
    requesterMemberId,
    channelCode,
    channelName,
    visibility,
  }) {
    const client = await db.connect();

    try {
      await client.query('BEGIN');

      const conversationResult = await client.query(`
        INSERT INTO ac_conversation (
          workspace_id,
          conversation_type,
          title,
          created_by_member_id
        )
        VALUES ($1, 'CHANNEL', $2, $3)
        RETURNING conversation_id, created_at, updated_at
      `, [workspaceId, channelName, requesterMemberId]);

      const conversation = conversationResult.rows[0];

      const channelResult = await client.query(`
        INSERT INTO ac_channel (
          workspace_id,
          conversation_id,
          channel_code,
          channel_name,
          visibility,
          created_by_member_id
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING
          channel_id,
          conversation_id,
          channel_code,
          channel_name,
          visibility,
          status,
          created_by_member_id,
          created_at,
          updated_at
      `, [
        workspaceId,
        conversation.conversation_id,
        channelCode,
        channelName,
        visibility,
        requesterMemberId,
      ]);

      const channel = channelResult.rows[0];

      await client.query(`
        INSERT INTO ac_channel_member (
          workspace_id,
          channel_id,
          workspace_member_id,
          member_role
        )
        VALUES ($1, $2, $3, 'OWNER')
      `, [workspaceId, channel.channel_id, requesterMemberId]);

      await client.query('COMMIT');

      return {
        ...channel,
        is_member: true,
        member_role: 'OWNER',
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  function canonicalPair(memberOne, memberTwo) {
    return memberOne < memberTwo
      ? [memberOne, memberTwo]
      : [memberTwo, memberOne];
  }

  async function findDirectMessageByPair({ workspaceId, memberAId, memberBId }) {
    const result = await db.query(`
      SELECT
        c.conversation_id,
        c.created_at,
        c.updated_at
      FROM ac_direct_message dm
      JOIN ac_conversation c
        ON c.workspace_id = dm.workspace_id
       AND c.conversation_id = dm.conversation_id
       AND c.conversation_type = dm.conversation_type
      WHERE dm.workspace_id = $1
        AND dm.member_a_id = $2
        AND dm.member_b_id = $3
        AND c.status = 'ACTIVE'
      LIMIT 1
    `, [workspaceId, memberAId, memberBId]);

    return result.rows?.[0] || null;
  }

  async function startDirectMessage({ workspaceId, requesterMemberId, targetMemberId }) {
    const [memberAId, memberBId] = canonicalPair(requesterMemberId, targetMemberId);

    const existing = await findDirectMessageByPair({
      workspaceId,
      memberAId,
      memberBId,
    });

    if (existing) {
      return {
        created: false,
        conversation_id: existing.conversation_id,
        created_at: existing.created_at,
        updated_at: existing.updated_at,
      };
    }

    const client = await db.connect();

    try {
      await client.query('BEGIN');

      const conversationResult = await client.query(`
        INSERT INTO ac_conversation (
          workspace_id,
          conversation_type,
          title,
          created_by_member_id
        )
        VALUES ($1, 'DM', NULL, $2)
        RETURNING conversation_id, created_at, updated_at
      `, [workspaceId, requesterMemberId]);

      const conversation = conversationResult.rows[0];

      await client.query(`
        INSERT INTO ac_direct_message (
          workspace_id,
          conversation_id,
          conversation_type,
          member_a_id,
          member_b_id
        )
        VALUES ($1, $2, 'DM', $3, $4)
      `, [
        workspaceId,
        conversation.conversation_id,
        memberAId,
        memberBId,
      ]);

      await client.query(`
        INSERT INTO ac_conversation_participant (
          workspace_id,
          conversation_id,
          workspace_member_id,
          participant_role
        )
        VALUES
          ($1, $2, $3, 'MEMBER'),
          ($1, $2, $4, 'MEMBER')
      `, [
        workspaceId,
        conversation.conversation_id,
        requesterMemberId,
        targetMemberId,
      ]);

      await client.query('COMMIT');

      return {
        created: true,
        conversation_id: conversation.conversation_id,
        created_at: conversation.created_at,
        updated_at: conversation.updated_at,
      };
    } catch (error) {
      await client.query('ROLLBACK');

      if (error && error.code === '23505' && error.constraint === 'pk_ac_direct_message') {
        const winner = await findDirectMessageByPair({
          workspaceId,
          memberAId,
          memberBId,
        });

        if (winner) {
          return {
            created: false,
            conversation_id: winner.conversation_id,
            created_at: winner.created_at,
            updated_at: winner.updated_at,
          };
        }
      }

      throw error;
    } finally {
      client.release();
    }
  }

  async function listDirectMessages({ workspaceId, requesterMemberId }) {
    const result = await db.query(`
      SELECT
        c.conversation_id,
        c.created_at,
        c.updated_at,
        other_member.workspace_member_id AS other_workspace_member_id,
        other_identity.identity_id AS other_identity_id,
        COALESCE(
          other_member.display_name_override,
          other_identity.display_name
        ) AS other_display_name,
        other_identity.primary_email AS other_primary_email,
        other_member.status AS other_member_status,
        other_identity.status AS other_identity_status
      FROM ac_direct_message dm
      JOIN ac_conversation c
        ON c.workspace_id = dm.workspace_id
       AND c.conversation_id = dm.conversation_id
       AND c.conversation_type = dm.conversation_type
      JOIN ac_conversation_participant self_participant
        ON self_participant.workspace_id = dm.workspace_id
       AND self_participant.conversation_id = dm.conversation_id
       AND self_participant.workspace_member_id = $2
       AND self_participant.left_at IS NULL
      JOIN ac_workspace_member other_member
        ON other_member.workspace_id = dm.workspace_id
       AND other_member.workspace_member_id = CASE
         WHEN dm.member_a_id = $2 THEN dm.member_b_id
         ELSE dm.member_a_id
       END
      JOIN ac_identity other_identity
        ON other_identity.identity_id = other_member.identity_id
      WHERE dm.workspace_id = $1
        AND ($2 = dm.member_a_id OR $2 = dm.member_b_id)
        AND c.status = 'ACTIVE'
      ORDER BY c.updated_at DESC, c.conversation_id
    `, [workspaceId, requesterMemberId]);

    return result.rows;
  }

  return Object.freeze({
    getActiveWorkspaceMember,
    listChannels,
    createChannel,
    findDirectMessageByPair,
    startDirectMessage,
    listDirectMessages,
  });
}

module.exports = {
  createCollaborationRepository,
};
