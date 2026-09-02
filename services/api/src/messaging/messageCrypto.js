'use strict';

const {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} = require('node:crypto');

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const ENCRYPTION_VERSION = 1;

function clean(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function invalidConfig(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function decodeKey(value, label) {
  const raw = clean(value);
  if (!raw) {
    throw invalidConfig('MESSAGE_ENCRYPTION_KEY_REQUIRED', `${label} is required`);
  }

  let key;
  try {
    key = Buffer.from(raw, 'base64');
  } catch {
    throw invalidConfig('MESSAGE_ENCRYPTION_KEY_INVALID', `${label} must be valid base64`);
  }

  if (key.length !== KEY_BYTES) {
    throw invalidConfig(
      'MESSAGE_ENCRYPTION_KEY_INVALID',
      `${label} must decode to exactly ${KEY_BYTES} bytes`
    );
  }
  return key;
}

function parseAdditionalKeys(value) {
  const raw = clean(value);
  if (!raw) return {};

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw invalidConfig(
      'MESSAGE_DECRYPTION_KEYS_INVALID',
      'AKSHACONNECT_MESSAGE_DECRYPTION_KEYS_JSON must be a JSON object'
    );
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw invalidConfig(
      'MESSAGE_DECRYPTION_KEYS_INVALID',
      'AKSHACONNECT_MESSAGE_DECRYPTION_KEYS_JSON must be a JSON object'
    );
  }
  return parsed;
}

function aadFor({ recordType = 'MESSAGE', workspaceId, conversationId, recordId }) {
  const cleanRecordType = clean(recordType).toUpperCase();
  const cleanWorkspaceId = clean(workspaceId);
  const cleanConversationId = clean(conversationId);
  const cleanRecordId = clean(recordId);

  if (!cleanRecordType || !cleanWorkspaceId || !cleanConversationId || !cleanRecordId) {
    throw invalidConfig(
      'MESSAGE_ENCRYPTION_CONTEXT_INVALID',
      'Message encryption context is incomplete'
    );
  }

  return Buffer.from(
    `akshaconnect:body:v${ENCRYPTION_VERSION}\u0000${cleanRecordType}\u0000${cleanWorkspaceId}\u0000${cleanConversationId}\u0000${cleanRecordId}`,
    'utf8'
  );
}

function encryptionShapePresent(record = {}) {
  return (
    record.body_ciphertext !== null && record.body_ciphertext !== undefined &&
    record.body_nonce !== null && record.body_nonce !== undefined &&
    record.body_auth_tag !== null && record.body_auth_tag !== undefined &&
    clean(record.body_key_id) &&
    Number(record.body_encryption_version) === ENCRYPTION_VERSION
  );
}

function encryptionShapeAbsent(record = {}) {
  return (
    (record.body_ciphertext === null || record.body_ciphertext === undefined) &&
    (record.body_nonce === null || record.body_nonce === undefined) &&
    (record.body_auth_tag === null || record.body_auth_tag === undefined) &&
    !clean(record.body_key_id) &&
    (record.body_encryption_version === null || record.body_encryption_version === undefined)
  );
}

function createMessageCrypto({ currentKeyId, currentKeyBase64, decryptionKeys = {} } = {}) {
  const keyId = clean(currentKeyId);
  if (!keyId || keyId.length > 120) {
    throw invalidConfig(
      'MESSAGE_ENCRYPTION_KEY_ID_INVALID',
      'Message encryption key id must contain 1 to 120 characters'
    );
  }

  const keyring = new Map();
  keyring.set(keyId, decodeKey(currentKeyBase64, 'AKSHACONNECT_MESSAGE_ENCRYPTION_KEY_B64'));

  for (const [additionalKeyId, encoded] of Object.entries(decryptionKeys || {})) {
    const normalizedId = clean(additionalKeyId);
    if (!normalizedId || normalizedId.length > 120) {
      throw invalidConfig(
        'MESSAGE_DECRYPTION_KEYS_INVALID',
        'Additional message decryption key ids must contain 1 to 120 characters'
      );
    }
    if (normalizedId === keyId) continue;
    keyring.set(normalizedId, decodeKey(encoded, `decryption key ${normalizedId}`));
  }

  function encryptText(bodyText, context) {
    if (bodyText === null || bodyText === undefined) return null;
    const plaintext = String(bodyText);
    const nonce = randomBytes(NONCE_BYTES);
    const cipher = createCipheriv(ALGORITHM, keyring.get(keyId), nonce, {
      authTagLength: AUTH_TAG_BYTES,
    });
    cipher.setAAD(aadFor(context));
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return Object.freeze({
      bodyCiphertext: ciphertext,
      bodyNonce: nonce,
      bodyAuthTag: authTag,
      bodyKeyId: keyId,
      bodyEncryptionVersion: ENCRYPTION_VERSION,
    });
  }

  function decryptText(record = {}, context) {
    if (encryptionShapeAbsent(record)) return null;
    if (!encryptionShapePresent(record)) {
      const error = new Error('Encrypted message body metadata is incomplete');
      error.code = 'MESSAGE_ENCRYPTION_SHAPE_INVALID';
      throw error;
    }

    const recordKeyId = clean(record.body_key_id);
    const key = keyring.get(recordKeyId);
    if (!key) {
      const error = new Error('Required message decryption key is unavailable');
      error.code = 'MESSAGE_DECRYPTION_KEY_UNAVAILABLE';
      throw error;
    }

    const nonce = Buffer.from(record.body_nonce);
    const authTag = Buffer.from(record.body_auth_tag);
    if (nonce.length !== NONCE_BYTES || authTag.length !== AUTH_TAG_BYTES) {
      const error = new Error('Encrypted message body metadata is invalid');
      error.code = 'MESSAGE_ENCRYPTION_SHAPE_INVALID';
      throw error;
    }

    try {
      const decipher = createDecipheriv(ALGORITHM, key, nonce, {
        authTagLength: AUTH_TAG_BYTES,
      });
      decipher.setAAD(aadFor(context));
      decipher.setAuthTag(authTag);
      return Buffer.concat([
        decipher.update(Buffer.from(record.body_ciphertext)),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      const error = new Error('Encrypted message body authentication failed');
      error.code = 'MESSAGE_DECRYPTION_FAILED';
      throw error;
    }
  }

  return Object.freeze({
    algorithm: ALGORITHM,
    currentKeyId: keyId,
    encryptionVersion: ENCRYPTION_VERSION,
    encryptText,
    decryptText,
  });
}

function createMessageCryptoFromEnv(env = process.env) {
  return createMessageCrypto({
    currentKeyId: env.AKSHACONNECT_MESSAGE_ENCRYPTION_KEY_ID,
    currentKeyBase64: env.AKSHACONNECT_MESSAGE_ENCRYPTION_KEY_B64,
    decryptionKeys: parseAdditionalKeys(env.AKSHACONNECT_MESSAGE_DECRYPTION_KEYS_JSON),
  });
}

module.exports = {
  ALGORITHM,
  KEY_BYTES,
  NONCE_BYTES,
  AUTH_TAG_BYTES,
  ENCRYPTION_VERSION,
  aadFor,
  createMessageCrypto,
  createMessageCryptoFromEnv,
};
