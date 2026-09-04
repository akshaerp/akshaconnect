
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const STORAGE_KEY_PATTERN = /^[0-9a-f-]{36}\.bin$/i;

function createLocalAttachmentStorage({ baseDir } = {}) {
  const root = String(baseDir || '').trim();

  async function ensureConfigured() {
    if (!root) {
      const error = new Error('Local attachment storage directory is not configured');
      error.code = 'ATTACHMENT_STORAGE_NOT_CONFIGURED';
      throw error;
    }
    await fs.mkdir(root, { recursive: true });
  }

  function absolutePath(storageKey) {
    const key = String(storageKey || '').trim();
    if (!STORAGE_KEY_PATTERN.test(key)) {
      const error = new Error('Attachment storage key is invalid');
      error.code = 'ATTACHMENT_STORAGE_KEY_INVALID';
      throw error;
    }
    return path.join(root, key);
  }

  async function put(storageKey, ciphertext) {
    await ensureConfigured();
    const target = absolutePath(storageKey);
    const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(temporary, Buffer.from(ciphertext), { flag: 'wx' });
    await fs.rename(temporary, target);
  }

  async function get(storageKey) {
    await ensureConfigured();
    return fs.readFile(absolutePath(storageKey));
  }

  async function remove(storageKey) {
    if (!root) return;
    try {
      await fs.unlink(absolutePath(storageKey));
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }

  return Object.freeze({
    providerCode: 'LOCAL',
    configured: Boolean(root),
    put,
    get,
    remove,
  });
}

module.exports = {
  STORAGE_KEY_PATTERN,
  createLocalAttachmentStorage,
};
