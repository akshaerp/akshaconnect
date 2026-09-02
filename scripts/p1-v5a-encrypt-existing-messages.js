'use strict';

const { createPostgresPool, verifyDatabaseIdentity } = require('../services/api/src/database/postgres');
const { createMessageCryptoFromEnv } = require('../services/api/src/messaging/messageCrypto');

const DEFAULT_BATCH_SIZE = 200;

function batchSize(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 1000
    ? parsed
    : DEFAULT_BATCH_SIZE;
}

async function encryptMessageBatch(pool, messageCrypto, limit) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`
      SELECT
        message_id,
        workspace_id,
        conversation_id,
        body_text
      FROM ac_message
      WHERE body_text IS NOT NULL
        AND body_ciphertext IS NULL
      ORDER BY created_at, message_id
      LIMIT $1
      FOR UPDATE SKIP LOCKED
    `, [limit]);

    for (const row of result.rows || []) {
      const encrypted = messageCrypto.encryptText(row.body_text, {
        recordType: 'MESSAGE',
        workspaceId: row.workspace_id,
        conversationId: row.conversation_id,
        recordId: row.message_id,
      });

      await client.query(`
        UPDATE ac_message
        SET
          body_ciphertext = $1,
          body_nonce = $2,
          body_auth_tag = $3,
          body_key_id = $4,
          body_encryption_version = $5
        WHERE workspace_id = $6
          AND message_id = $7
          AND body_text IS NOT NULL
          AND body_ciphertext IS NULL
      `, [
        encrypted.bodyCiphertext,
        encrypted.bodyNonce,
        encrypted.bodyAuthTag,
        encrypted.bodyKeyId,
        encrypted.bodyEncryptionVersion,
        row.workspace_id,
        row.message_id,
      ]);
    }

    await client.query('COMMIT');
    return result.rows?.length || 0;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function encryptRevisionBatch(pool, messageCrypto, limit) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`
      SELECT
        r.message_revision_id,
        r.workspace_id,
        r.message_id,
        r.body_text,
        m.conversation_id
      FROM ac_message_revision r
      JOIN ac_message m
        ON m.workspace_id = r.workspace_id
       AND m.message_id = r.message_id
      WHERE r.body_text IS NOT NULL
        AND r.body_ciphertext IS NULL
      ORDER BY r.edited_at, r.message_revision_id
      LIMIT $1
      FOR UPDATE OF r SKIP LOCKED
    `, [limit]);

    for (const row of result.rows || []) {
      const encrypted = messageCrypto.encryptText(row.body_text, {
        recordType: 'REVISION',
        workspaceId: row.workspace_id,
        conversationId: row.conversation_id,
        recordId: row.message_revision_id,
      });

      await client.query(`
        UPDATE ac_message_revision
        SET
          body_ciphertext = $1,
          body_nonce = $2,
          body_auth_tag = $3,
          body_key_id = $4,
          body_encryption_version = $5
        WHERE workspace_id = $6
          AND message_revision_id = $7
          AND body_text IS NOT NULL
          AND body_ciphertext IS NULL
      `, [
        encrypted.bodyCiphertext,
        encrypted.bodyNonce,
        encrypted.bodyAuthTag,
        encrypted.bodyKeyId,
        encrypted.bodyEncryptionVersion,
        row.workspace_id,
        row.message_revision_id,
      ]);
    }

    await client.query('COMMIT');
    return result.rows?.length || 0;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function assertBackfillComplete(pool) {
  const result = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM ac_message
       WHERE body_text IS NOT NULL AND body_ciphertext IS NULL) AS remaining_messages,
      (SELECT COUNT(*)::int FROM ac_message_revision
       WHERE body_text IS NOT NULL AND body_ciphertext IS NULL) AS remaining_revisions
  `);
  const row = result.rows?.[0] || {};
  if (row.remaining_messages !== 0 || row.remaining_revisions !== 0) {
    const error = new Error('P1-V5A message encryption backfill is incomplete');
    error.code = 'MESSAGE_ENCRYPTION_BACKFILL_INCOMPLETE';
    throw error;
  }
}

async function main() {
  const pool = createPostgresPool(process.env);
  const expectedDatabase = process.env.AKSHACONNECT_DATABASE_EXPECTED_NAME || 'akshaconnect';
  const messageCrypto = createMessageCryptoFromEnv(process.env);
  const limit = batchSize(process.env.AKSHACONNECT_MESSAGE_ENCRYPTION_BATCH_SIZE);

  try {
    const database = await verifyDatabaseIdentity(pool, expectedDatabase);
    console.log(`P1-V5A encryption backfill connected to database ${database}`);
    console.log(`P1-V5A encryption key id: ${messageCrypto.currentKeyId}`);

    let encryptedMessages = 0;
    let encryptedRevisions = 0;

    while (true) {
      const count = await encryptMessageBatch(pool, messageCrypto, limit);
      encryptedMessages += count;
      if (count < limit) break;
    }

    while (true) {
      const count = await encryptRevisionBatch(pool, messageCrypto, limit);
      encryptedRevisions += count;
      if (count < limit) break;
    }

    await assertBackfillComplete(pool);

    console.log(`P1-V5A encrypted message rows: ${encryptedMessages}`);
    console.log(`P1-V5A encrypted revision rows: ${encryptedRevisions}`);
    console.log('P1-V5A encryption backfill PASS');
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`P1-V5A encryption backfill failed: ${error.code || error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_BATCH_SIZE,
  batchSize,
  encryptMessageBatch,
  encryptRevisionBatch,
  assertBackfillComplete,
};
