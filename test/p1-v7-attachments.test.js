
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  createAttachmentCrypto,
} = require('../services/api/src/attachments/attachmentCrypto');
const {
  createLocalAttachmentStorage,
} = require('../services/api/src/attachments/attachmentStorage');
const migration = fs.readFileSync(
  path.join(
    __dirname,
    '..',
    'database',
    'migrations',
    '202609040900__p1_v7_attachment_foundation.sql'
  ),
  'utf8'
);
const verification = fs.readFileSync(
  path.join(
    __dirname,
    '..',
    'database',
    'verification',
    'verify_p1_v7_attachment_foundation.sql'
  ),
  'utf8'
);
const app = fs.readFileSync(
  path.join(__dirname, '..', 'apps', 'web', 'src', 'App.jsx'),
  'utf8'
);
const api = fs.readFileSync(
  path.join(__dirname, '..', 'apps', 'web', 'src', 'api.js'),
  'utf8'
);
const serverApp = fs.readFileSync(
  path.join(__dirname, '..', 'services', 'api', 'src', 'app.js'),
  'utf8'
);
const repository = fs.readFileSync(
  path.join(
    __dirname,
    '..',
    'services',
    'api',
    'src',
    'attachments',
    'attachmentRepository.js'
  ),
  'utf8'
);
const attachmentServiceSource = fs.readFileSync(
  path.join(
    __dirname,
    '..',
    'services',
    'api',
    'src',
    'attachments',
    'attachmentService.js'
  ),
  'utf8'
);

test('P1-V7 V2 encrypts attachment bytes with authenticated context', () => {
  const key = Buffer.alloc(32, 7).toString('base64');
  const crypto = createAttachmentCrypto({
    currentKeyId: 'test-key',
    currentKeyBase64: key,
  });
  const context = {
    workspaceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    conversationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    attachmentId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  };

  const plaintext = Buffer.from('attachment secret bytes');
  const encrypted = crypto.encryptBuffer(plaintext, context);
  assert.notDeepEqual(encrypted.ciphertext, plaintext);

  const restored = crypto.decryptBuffer({
    ciphertext: encrypted.ciphertext,
    content_nonce: encrypted.nonce,
    content_auth_tag: encrypted.authTag,
    encryption_key_id: encrypted.keyId,
  }, context);

  assert.deepEqual(restored, plaintext);
  assert.throws(() => crypto.decryptBuffer({
    ciphertext: Buffer.concat([encrypted.ciphertext, Buffer.from([1])]),
    content_nonce: encrypted.nonce,
    content_auth_tag: encrypted.authTag,
    encryption_key_id: encrypted.keyId,
  }, context), /authentication failed/);
});

test('P1-V7 V2 local storage never derives a filesystem path from client filename', async () => {
  const directory = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'akshaconnect-attachment-test-')
  );
  const storage = createLocalAttachmentStorage({ baseDir: directory });

  await storage.put(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.bin',
    Buffer.from('ciphertext')
  );

  const restored = await storage.get(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.bin'
  );
  assert.equal(restored.toString('utf8'), 'ciphertext');
  await assert.rejects(
    storage.put('../escape.bin', Buffer.from('bad')),
    /storage key is invalid/
  );

  await fs.promises.rm(directory, { recursive: true, force: true });
});

test('P1-V7 V2 attachment service has bounded type, size and signature policy', () => {
  assert.match(attachmentServiceSource, /MAX_ATTACHMENT_BYTES = 10 \* 1024 \* 1024/);
  assert.match(attachmentServiceSource, /MAX_FILE_NAME_CHARS = 255/);
  assert.match(attachmentServiceSource, /application\/pdf/);
  assert.match(attachmentServiceSource, /ATTACHMENT_TYPE_NOT_ALLOWED/);
  assert.match(attachmentServiceSource, /ATTACHMENT_CONTENT_MISMATCH/);
  assert.match(attachmentServiceSource, /%PDF-/);
  assert.match(attachmentServiceSource, /\[\\\/\\\\\\u0000-\\u001f\\u007f\]/);
});

test('P1-V7 V2 schema binds attachment to workspace conversation message scope', () => {
  assert.match(migration, /message_type IN \('TEXT', 'SYSTEM', 'EVENT', 'ATTACHMENT'\)/);
  assert.match(
    migration,
    /FOREIGN KEY \(workspace_id, conversation_id, message_id\)[\s\S]*REFERENCES ac_message\(workspace_id, conversation_id, message_id\)/
  );
  assert.match(migration, /size_bytes BETWEEN 1 AND 10485760/);
  assert.match(migration, /OCTET_LENGTH\(content_nonce\) = 12/);
  assert.match(migration, /OCTET_LENGTH\(content_auth_tag\) = 16/);
  assert.doesNotMatch(migration, /original_file_name|plaintext_content|content_bytes/i);
  assert.match(verification, /forbidden plaintext\/blob columns/);
});

test('P1-V7 V2 server authorizes upload and download through conversation routes', () => {
  assert.match(serverApp, /attachmentUploadRoute/);
  assert.match(serverApp, /attachmentContentRoute/);
  assert.match(serverApp, /verifyAccessToken\(bearerToken\(req\)\)/);
  assert.match(serverApp, /uploadHumanAttachment/);
  assert.match(serverApp, /downloadAttachment/);
  assert.match(serverApp, /decorateMessages/);
});

test('P1-V7 V2 repository keeps filename in encrypted parent message body', () => {
  assert.match(repository, /messageCrypto\.encryptText\(fileName/);
  assert.match(repository, /message_type,[\s\S]*'ATTACHMENT'/);
  assert.match(repository, /decryptFileName/);
  assert.doesNotMatch(repository, /INSERT INTO ac_attachment[\s\S]*original_file_name/);
});

test('P1-V7 V2 web composer uses stable per-file client ids for retry safety', () => {
  assert.match(app, /MAX_PENDING_ATTACHMENTS = 4/);
  assert.match(app, /clientMessageId: makeClientMessageId\(\)/);
  assert.match(app, /pendingFiles/);
  assert.match(app, /uploadAttachment\(token, selected\.id, pending\)/);
  assert.match(app, /attachment-card/);
  assert.match(app, /downloadAttachment/);
  assert.match(api, /x-akshaconnect-file-name/);
  assert.match(api, /x-client-message-id/);
});

test('P1-V7 V2 does not add provider-specific ERP contract to attachment core', () => {
  const attachmentRoot = path.join(
    __dirname,
    '..',
    'services',
    'api',
    'src',
    'attachments'
  );
  const source = fs.readdirSync(attachmentRoot)
    .filter((name) => name.endsWith('.js'))
    .map((name) => fs.readFileSync(path.join(attachmentRoot, name), 'utf8'))
    .join('\n');

  assert.doesNotMatch(
    source,
    /module_code|function_code|sec_effective_user_actions|akshaerp\./i
  );
});
