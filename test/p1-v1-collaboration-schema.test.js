'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const migrationPath = path.join(root, 'database', 'migrations', '202609011610__p1_v1_collaboration_foundation.sql');
const architecturePath = path.join(root, 'docs', 'architecture', 'P1-V1-COLLABORATION-PERSISTENCE.md');

const sql = fs.readFileSync(migrationPath, 'utf8');
const architecture = fs.readFileSync(architecturePath, 'utf8');

test('P1-V1 creates the required collaboration-owned tables', () => {
  const tables = [
    'ac_workspace',
    'ac_identity',
    'ac_identity_provider_link',
    'ac_workspace_member',
    'ac_conversation',
    'ac_channel',
    'ac_channel_member',
    'ac_conversation_participant',
    'ac_system_sender',
    'ac_message',
    'ac_message_revision',
    'ac_read_cursor',
    'ac_event_receipt',
  ];

  for (const table of tables) {
    assert.ok(sql.includes(`CREATE TABLE ${table} (`), `missing table ${table}`);
  }
});

test('P1-V1 schema contains no AkshaERP internal security/module coupling', () => {
  const forbidden = [
    'module_code',
    'function_code',
    'sec_effective_user_actions',
    'sec_graphql_operation_mappings',
    'erp_user_id',
  ];

  for (const token of forbidden) {
    assert.equal(
      sql.toLowerCase().includes(token.toLowerCase()),
      false,
      `schema must not contain ${token}`
    );
  }
});

test('workspace-scoped relationships use composite workspace foreign keys', () => {
  const requiredFragments = [
    'FOREIGN KEY (workspace_id, created_by_member_id)',
    'FOREIGN KEY (workspace_id, conversation_id)',
    'FOREIGN KEY (workspace_id, workspace_member_id)',
    'FOREIGN KEY (workspace_id, sender_member_id)',
    'FOREIGN KEY (workspace_id, system_sender_id)',
    'FOREIGN KEY (workspace_id, reply_to_message_id)',
    'FOREIGN KEY (workspace_id, message_id)',
  ];

  for (const fragment of requiredFragments) {
    assert.ok(sql.includes(fragment), `missing composite isolation FK: ${fragment}`);
  }
});

test('human and system senders are structurally distinct', () => {
  assert.match(sql, /CONSTRAINT ck_ac_message_sender CHECK/);
  assert.match(
    sql,
    /sender_type = 'HUMAN' AND sender_member_id IS NOT NULL AND system_sender_id IS NULL/
  );
  assert.match(
    sql,
    /sender_type = 'SYSTEM' AND sender_member_id IS NULL AND system_sender_id IS NOT NULL/
  );
});

test('P1-V1 defines both client and provider event idempotency', () => {
  assert.match(sql, /uq_ac_message_client_id/);
  assert.match(sql, /client_message_id IS NOT NULL/);
  assert.match(sql, /uq_ac_event_receipt_provider_event/);
  assert.match(sql, /UNIQUE \(workspace_id, source_provider, event_id\)/);
});

test('identity is provider-neutral and provider subjects are opaque text', () => {
  assert.match(sql, /CREATE TABLE ac_identity_provider_link/);
  assert.match(sql, /provider_code VARCHAR\(40\) NOT NULL/);
  assert.match(sql, /external_subject VARCHAR\(255\) NOT NULL/);
  assert.match(architecture, /AkshaConnect internal identity is not an AkshaERP user ID/i);
});


test('P1-V1 hardening keeps replies and read cursors in the same conversation', () => {
  const hardeningPath = path.join(
    root,
    'database',
    'migrations',
    '202609011700__p1_v1_conversation_message_integrity.sql'
  );
  const hardeningSql = fs.readFileSync(hardeningPath, 'utf8');

  assert.match(
    hardeningSql,
    /UNIQUE \(workspace_id, conversation_id, message_id\)/
  );
  assert.match(
    hardeningSql,
    /FOREIGN KEY \(workspace_id, conversation_id, reply_to_message_id\)/
  );
  assert.match(
    hardeningSql,
    /FOREIGN KEY \(workspace_id, conversation_id, last_read_message_id\)/
  );
});

test('P1-V1 architecture requires a separate AkshaConnect database boundary', () => {
  assert.match(architecture, /AkshaConnect uses its own PostgreSQL database/i);
  assert.match(architecture, /must not create foreign keys, views, joins, or direct table dependencies into an AkshaERP database/i);
});
