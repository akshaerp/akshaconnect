'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  KEY_BYTES,
  NONCE_BYTES,
  AUTH_TAG_BYTES,
  createMessageCrypto,
  createMessageCryptoFromEnv,
} = require('../services/api/src/messaging/messageCrypto');

const root = path.join(__dirname, '..');
const KEY_A = Buffer.alloc(KEY_BYTES, 0x11).toString('base64');
const KEY_B = Buffer.alloc(KEY_BYTES, 0x22).toString('base64');
const CONTEXT = Object.freeze({
  recordType: 'MESSAGE',
  workspaceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  conversationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  recordId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
});

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function cryptoWith(keyId = 'dev-v1', key = KEY_A, decryptionKeys = {}) {
  return createMessageCrypto({
    currentKeyId: keyId,
    currentKeyBase64: key,
    decryptionKeys,
  });
}

function stored(encrypted) {
  return {
    body_ciphertext: encrypted.bodyCiphertext,
    body_nonce: encrypted.bodyNonce,
    body_auth_tag: encrypted.bodyAuthTag,
    body_key_id: encrypted.bodyKeyId,
    body_encryption_version: encrypted.bodyEncryptionVersion,
  };
}

test('P1-V5A AES-256-GCM round trip restores plaintext only in application memory', () => {
  const messageCrypto = cryptoWith();
  const encrypted = messageCrypto.encryptText('sensitive message', CONTEXT);

  assert.equal(encrypted.bodyNonce.length, NONCE_BYTES);
  assert.equal(encrypted.bodyAuthTag.length, AUTH_TAG_BYTES);
  assert.equal(encrypted.bodyKeyId, 'dev-v1');
  assert.equal(encrypted.bodyEncryptionVersion, 1);
  assert.notEqual(encrypted.bodyCiphertext.toString('utf8'), 'sensitive message');
  assert.equal(messageCrypto.decryptText(stored(encrypted), CONTEXT), 'sensitive message');
});

test('P1-V5A uses a fresh GCM nonce so identical plaintext does not create identical ciphertext', () => {
  const messageCrypto = cryptoWith();
  const first = messageCrypto.encryptText('same body', CONTEXT);
  const second = messageCrypto.encryptText('same body', CONTEXT);

  assert.notDeepEqual(first.bodyNonce, second.bodyNonce);
  assert.notDeepEqual(first.bodyCiphertext, second.bodyCiphertext);
});

test('P1-V5A authenticated encryption fails closed on ciphertext or row-context tampering', () => {
  const messageCrypto = cryptoWith();
  const encrypted = messageCrypto.encryptText('tamper protected', CONTEXT);
  const tampered = stored(encrypted);
  tampered.body_ciphertext = Buffer.from(tampered.body_ciphertext);
  tampered.body_ciphertext[0] ^= 0xff;

  assert.throws(
    () => messageCrypto.decryptText(tampered, CONTEXT),
    (error) => error.code === 'MESSAGE_DECRYPTION_FAILED'
  );
  assert.throws(
    () => messageCrypto.decryptText(stored(encrypted), { ...CONTEXT, recordId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' }),
    (error) => error.code === 'MESSAGE_DECRYPTION_FAILED'
  );
});

test('P1-V5A supports old-key decryption for explicit key rotation', () => {
  const oldCrypto = cryptoWith('old-v1', KEY_A);
  const encrypted = oldCrypto.encryptText('old message', CONTEXT);
  const rotated = cryptoWith('new-v2', KEY_B, { 'old-v1': KEY_A });

  assert.equal(rotated.decryptText(stored(encrypted), CONTEXT), 'old message');
  assert.equal(rotated.encryptText('new message', CONTEXT).bodyKeyId, 'new-v2');
});

test('P1-V5A runtime fails closed when encryption configuration is absent or invalid', () => {
  assert.throws(
    () => createMessageCryptoFromEnv({}),
    (error) => error.code === 'MESSAGE_ENCRYPTION_KEY_ID_INVALID'
  );
  assert.throws(
    () => createMessageCrypto({ currentKeyId: 'bad', currentKeyBase64: Buffer.alloc(16).toString('base64') }),
    (error) => error.code === 'MESSAGE_ENCRYPTION_KEY_INVALID'
  );
});

test('P1-V5A repository stores encrypted fields and does not persist/select plaintext body column', () => {
  const source = read('services/api/src/messaging/messagingRepository.js');
  assert.match(source, /body_ciphertext/);
  assert.match(source, /body_nonce/);
  assert.match(source, /body_auth_tag/);
  assert.match(source, /body_key_id/);
  assert.match(source, /messageCrypto\.encryptText/);
  assert.match(source, /messageCrypto\.decryptText/);
  assert.doesNotMatch(source, /m\.body_text/);
  assert.doesNotMatch(source, /message_type,\s*body_text,/);
});

test('P1-V5A migrations encrypt messages and revisions then physically remove plaintext columns', () => {
  const stage = read('database/migrations/202609012300__p1_v5a_message_encryption_columns.sql');
  const finalize = read('database/migrations/202609012310__p1_v5a_message_encryption_finalize.sql');
  const backfill = read('scripts/p1-v5a-encrypt-existing-messages.js');

  assert.match(stage, /ALTER TABLE ac_message[\s\S]*body_ciphertext BYTEA/);
  assert.match(stage, /ALTER TABLE ac_message_revision[\s\S]*body_ciphertext BYTEA/);
  assert.match(backfill, /messageCrypto\.encryptText\(row\.body_text/);
  assert.match(backfill, /recordType: 'REVISION'/);
  assert.match(finalize, /ALTER TABLE ac_message[\s\S]*DROP COLUMN body_text/);
  assert.match(finalize, /ALTER TABLE ac_message_revision[\s\S]*DROP COLUMN body_text/);
  assert.match(finalize, /ck_ac_message_encrypted_body/);
  assert.match(finalize, /ck_ac_message_revision_encrypted_body/);
});

test('P1-V5A encryption implementation is provider-neutral and key material is not embedded', () => {
  const files = [
    'services/api/src/messaging/messageCrypto.js',
    'services/api/src/messaging/messagingRepository.js',
    'scripts/p1-v5a-encrypt-existing-messages.js',
  ];
  const source = files.map(read).join('\n');
  assert.doesNotMatch(source, /module_code|function_code|sec_effective|organization_id|branch_id/i);
  assert.doesNotMatch(source, /postgresql:\/\/postgres:postgres/);
  assert.doesNotMatch(source, /BEGIN PRIVATE KEY|AKIA[0-9A-Z]{16}/);
});
