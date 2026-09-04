
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

function configError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function decodeKey(value, label) {
  const raw = clean(value);
  if (!raw) {
    throw configError('ATTACHMENT_ENCRYPTION_KEY_REQUIRED', `${label} is required`);
  }

  const key = Buffer.from(raw, 'base64');
  if (key.length !== KEY_BYTES) {
    throw configError(
      'ATTACHMENT_ENCRYPTION_KEY_INVALID',
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
    throw configError(
      'ATTACHMENT_DECRYPTION_KEYS_INVALID',
      'AKSHACONNECT_MESSAGE_DECRYPTION_KEYS_JSON must be a JSON object'
    );
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw configError(
      'ATTACHMENT_DECRYPTION_KEYS_INVALID',
      'AKSHACONNECT_MESSAGE_DECRYPTION_KEYS_JSON must be a JSON object'
    );
  }
  return parsed;
}

function attachmentAad({ workspaceId, conversationId, attachmentId }) {
  const workspace = clean(workspaceId);
  const conversation = clean(conversationId);
  const attachment = clean(attachmentId);
  if (!workspace || !conversation || !attachment) {
    throw configError(
      'ATTACHMENT_ENCRYPTION_CONTEXT_INVALID',
      'Attachment encryption context is incomplete'
    );
  }

  return Buffer.from(
    `akshaconnect:attachment:v${ENCRYPTION_VERSION}\u0000${workspace}\u0000${conversation}\u0000${attachment}`,
    'utf8'
  );
}

function createAttachmentCrypto({
  currentKeyId,
  currentKeyBase64,
  decryptionKeys = {},
} = {}) {
  const keyId = clean(currentKeyId);
  if (!keyId || keyId.length > 120) {
    throw configError(
      'ATTACHMENT_ENCRYPTION_KEY_ID_INVALID',
      'Attachment encryption key id must contain 1 to 120 characters'
    );
  }

  const keyring = new Map();
  keyring.set(
    keyId,
    decodeKey(currentKeyBase64, 'AKSHACONNECT_MESSAGE_ENCRYPTION_KEY_B64')
  );

  for (const [additionalKeyId, encoded] of Object.entries(decryptionKeys || {})) {
    const normalized = clean(additionalKeyId);
    if (!normalized || normalized.length > 120) {
      throw configError(
        'ATTACHMENT_DECRYPTION_KEYS_INVALID',
        'Additional attachment decryption key ids must contain 1 to 120 characters'
      );
    }
    if (normalized === keyId) continue;
    keyring.set(normalized, decodeKey(encoded, `decryption key ${normalized}`));
  }

  function encryptBuffer(plaintext, context) {
    const source = Buffer.from(plaintext || []);
    const nonce = randomBytes(NONCE_BYTES);
    const cipher = createCipheriv(ALGORITHM, keyring.get(keyId), nonce, {
      authTagLength: AUTH_TAG_BYTES,
    });
    cipher.setAAD(attachmentAad(context));
    const ciphertext = Buffer.concat([cipher.update(source), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return Object.freeze({
      ciphertext,
      nonce,
      authTag,
      keyId,
      encryptionVersion: ENCRYPTION_VERSION,
    });
  }

  function decryptBuffer(record = {}, context) {
    const recordKeyId = clean(record.encryption_key_id ?? record.keyId);
    const key = keyring.get(recordKeyId);
    if (!key) {
      throw configError(
        'ATTACHMENT_DECRYPTION_KEY_UNAVAILABLE',
        'Required attachment decryption key is unavailable'
      );
    }

    const nonce = Buffer.from(record.content_nonce ?? record.nonce ?? []);
    const authTag = Buffer.from(record.content_auth_tag ?? record.authTag ?? []);
    const ciphertext = Buffer.from(record.ciphertext ?? []);

    if (nonce.length !== NONCE_BYTES || authTag.length !== AUTH_TAG_BYTES) {
      throw configError(
        'ATTACHMENT_ENCRYPTION_SHAPE_INVALID',
        'Attachment encryption metadata is invalid'
      );
    }

    try {
      const decipher = createDecipheriv(ALGORITHM, key, nonce, {
        authTagLength: AUTH_TAG_BYTES,
      });
      decipher.setAAD(attachmentAad(context));
      decipher.setAuthTag(authTag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } catch {
      throw configError(
        'ATTACHMENT_DECRYPTION_FAILED',
        'Encrypted attachment authentication failed'
      );
    }
  }

  return Object.freeze({
    algorithm: ALGORITHM,
    currentKeyId: keyId,
    encryptionVersion: ENCRYPTION_VERSION,
    encryptBuffer,
    decryptBuffer,
  });
}

function createAttachmentCryptoFromEnv(env = process.env) {
  return createAttachmentCrypto({
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
  attachmentAad,
  createAttachmentCrypto,
  createAttachmentCryptoFromEnv,
};
