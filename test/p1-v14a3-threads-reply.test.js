'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('V14 Wave 2 backend exposes root-only threads without a schema migration', () => {
  const repo = read('services/api/src/messaging/messagingRepository.js');
  const service = read('services/api/src/messaging/messagingService.js');
  const app = read('services/api/src/app.js');

  assert.match(repo, /m\.reply_to_message_id IS NULL/);
  assert.match(repo, /thread_reply_count/);
  assert.match(repo, /async function listThread/);
  assert.match(service, /MESSAGE_REPLY_NESTED_INVALID/);
  assert.match(service, /async function listThread/);
  assert.match(app, /messages\\\/\(\[\^\/\]\+\)\\\/thread/);
});

test('V14 Wave 2 attachment replies preserve the thread root', () => {
  const service = read('services/api/src/attachments/attachmentService.js');
  const repository = read('services/api/src/attachments/attachmentRepository.js');
  const mobileApi = read('apps/mobile/src/api/client.js');
  const webApi = read('apps/web/src/api.js');

  assert.match(service, /replyToMessageId/);
  assert.match(repository, /reply_to_message_id/);
  assert.match(mobileApi, /x-reply-to-message-id/);
  assert.match(webApi, /x-reply-to-message-id/);
});

test('V14 Wave 2 provides web and mobile thread surfaces', () => {
  const web = read('apps/web/src/App.jsx');
  const webThread = read('apps/web/src/ThreadPanel.jsx');
  const mobile = read('apps/mobile/src/screens/ConversationScreen.jsx');
  const mobileThread = read('apps/mobile/src/screens/ThreadModal.jsx');

  assert.match(web, /Reply in thread/);
  assert.match(web, /<ThreadPanel/);
  assert.match(webThread, /replyToMessageId:\s*parentId/);
  assert.match(webThread, /Reply in thread/);
  assert.match(mobile, /Reply in thread/);
  assert.match(mobile, /<ThreadModal/);
  assert.match(mobileThread, /replyToMessageId:\s*parentId/);
  assert.match(mobileThread, /Reply in thread/);
});
