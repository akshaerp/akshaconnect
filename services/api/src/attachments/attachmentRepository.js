
'use strict';

const { randomUUID } = require('node:crypto');

function createAttachmentRepository(db, { messageCrypto } = {}) {
  if (!db || typeof db.query !== 'function' || typeof db.connect !== 'function') {
    throw new TypeError('A PostgreSQL pool is required');
  }
  if (!messageCrypto || typeof messageCrypto.encryptText !== 'function') {
    throw new TypeError('Message crypto is required');
  }

  function decryptFileName(row) {
    if (!row) return '';
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
    }) || 'attachment';
  }

  function publicAttachment(row) {
    return Object.freeze({
      attachment_id: row.attachment_id,
      message_id: row.message_id,
      file_name: decryptFileName(row),
      content_type: row.content_type,
      size_bytes: Number(row.size_bytes),
      sha256_hex: row.sha256_hex,
      created_at: row.created_at,
    });
  }

  async function createAttachmentMessage({
    workspaceId,
    conversationId,
    senderMemberId,
    clientMessageId,
    fileName,
    contentType,
    sizeBytes,
    sha256Hex,
    storageProvider,
    storageKey,
    encryption,
    messageId = randomUUID(),
    attachmentId = randomUUID(),
  }) {
    const encryptedName = messageCrypto.encryptText(fileName, {
      recordType: 'MESSAGE',
      workspaceId,
      conversationId,
      recordId: messageId,
    });

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      await client.query(`
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
          client_message_id
        )
        VALUES ($1, $2, $3, 'HUMAN', $4, 'ATTACHMENT', $5, $6, $7, $8, $9, $10)
      `, [
        messageId,
        workspaceId,
        conversationId,
        senderMemberId,
        encryptedName.bodyCiphertext,
        encryptedName.bodyNonce,
        encryptedName.bodyAuthTag,
        encryptedName.bodyKeyId,
        encryptedName.bodyEncryptionVersion,
        clientMessageId,
      ]);

      await client.query(`
        INSERT INTO ac_attachment (
          attachment_id,
          workspace_id,
          conversation_id,
          message_id,
          uploaded_by_member_id,
          content_type,
          size_bytes,
          sha256_hex,
          storage_provider,
          storage_key,
          content_nonce,
          content_auth_tag,
          encryption_key_id,
          encryption_version
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      `, [
        attachmentId,
        workspaceId,
        conversationId,
        messageId,
        senderMemberId,
        contentType,
        sizeBytes,
        sha256Hex,
        storageProvider,
        storageKey,
        encryption.nonce,
        encryption.authTag,
        encryption.keyId,
        encryption.encryptionVersion,
      ]);

      await client.query(`
        UPDATE ac_conversation
        SET updated_at = NOW()
        WHERE workspace_id = $1
          AND conversation_id = $2
      `, [workspaceId, conversationId]);

      await client.query('COMMIT');
      return { messageId, attachmentId };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async function attachmentSelect(whereSql, params) {
    const result = await db.query(`
      SELECT
        a.attachment_id,
        a.workspace_id,
        a.conversation_id,
        a.message_id,
        a.uploaded_by_member_id,
        a.content_type,
        a.size_bytes,
        a.sha256_hex,
        a.storage_provider,
        a.storage_key,
        a.content_nonce,
        a.content_auth_tag,
        a.encryption_key_id,
        a.encryption_version,
        a.created_at,
        m.body_ciphertext,
        m.body_nonce,
        m.body_auth_tag,
        m.body_key_id,
        m.body_encryption_version
      FROM ac_attachment a
      JOIN ac_message m
        ON m.workspace_id = a.workspace_id
       AND m.conversation_id = a.conversation_id
       AND m.message_id = a.message_id
      WHERE ${whereSql}
    `, params);
    return result.rows || [];
  }

  async function findAttachmentByMessageId({
    workspaceId,
    conversationId,
    messageId,
  }) {
    const rows = await attachmentSelect(
      `a.workspace_id = $1
       AND a.conversation_id = $2
       AND a.message_id = $3
       LIMIT 1`,
      [workspaceId, conversationId, messageId]
    );
    return rows[0] ? publicAttachment(rows[0]) : null;
  }

  async function listAttachmentsForMessages({
    workspaceId,
    conversationId,
    messageIds,
  }) {
    if (!Array.isArray(messageIds) || messageIds.length === 0) return [];
    const rows = await attachmentSelect(
      `a.workspace_id = $1
       AND a.conversation_id = $2
       AND a.message_id = ANY($3::uuid[])
       ORDER BY a.created_at, a.attachment_id`,
      [workspaceId, conversationId, messageIds]
    );
    return rows.map(publicAttachment);
  }

  async function getAttachmentForDownload({
    workspaceId,
    conversationId,
    attachmentId,
  }) {
    const rows = await attachmentSelect(
      `a.workspace_id = $1
       AND a.conversation_id = $2
       AND a.attachment_id = $3
       LIMIT 1`,
      [workspaceId, conversationId, attachmentId]
    );
    if (!rows[0]) return null;
    return Object.freeze({
      ...publicAttachment(rows[0]),
      storage_provider: rows[0].storage_provider,
      storage_key: rows[0].storage_key,
      content_nonce: rows[0].content_nonce,
      content_auth_tag: rows[0].content_auth_tag,
      encryption_key_id: rows[0].encryption_key_id,
      encryption_version: rows[0].encryption_version,
    });
  }

  return Object.freeze({
    createAttachmentMessage,
    findAttachmentByMessageId,
    listAttachmentsForMessages,
    getAttachmentForDownload,
  });
}

module.exports = { createAttachmentRepository };
