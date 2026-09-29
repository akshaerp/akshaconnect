'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('V16-B migration adds dedicated thread read cursor', () => {
  const sql = read('database/migrations/post_v1/acn/202609281130__acn_thread_read_state_v16_b.sql');
  assert.match(sql, /CREATE TABLE public\.ac_thread_read_cursor/);
  assert.match(sql, /thread_root_message_id UUID NOT NULL/);
  assert.match(sql, /last_read_message_id UUID NOT NULL/);
});

test('V16-B API exposes thread read cursor route', () => {
  const app = read('services/api/src/app.js');
  const service = read('services/api/src/messaging/messagingService.js');
  assert.match(app, /thread\\\/read-cursor/);
  assert.match(service, /advanceThreadReadCursor/);
  assert.match(service, /thread_read_cursor\.updated/);
});

test('V16-B conversation history carries unread thread and read receipt counts', () => {
  const repository = read('services/api/src/messaging/messagingRepository.js');
  assert.match(repository, /AS thread_unread_count/);
  assert.match(repository, /AS read_by_count/);
  assert.match(repository, /m\.reply_to_message_id IS NULL/);
});

test('V16-B mobile and web use dedicated thread read cursor', () => {
  const mobileApi = read('apps/mobile/src/api/client.js');
  const mobile = read('apps/mobile/src/screens/ConversationScreen.jsx');
  const webApi = read('apps/web/src/api.js');
  const web = read('apps/web/src/App.jsx');
  assert.match(mobileApi, /markThreadRead/);
  assert.match(mobile, /thread_unread_count/);
  assert.match(mobile, /Read by/);
  assert.match(webApi, /markThreadRead/);
  assert.match(web, /thread_unread_count/);
  assert.match(web, /Read by/);
});
