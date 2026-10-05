'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('V16-R exposes a sender-authorized paginated message readers endpoint without a schema migration', () => {
  const handler = read('services/api/src/messaging/messageReadersHttpHandler.js');
  const server = read('services/api/src/server.js');

  assert.match(handler, /messages\\\/\(\[\^\/\]\+\)\\\/readers/);
  assert.match(handler, /MESSAGE_READERS_NOT_ALLOWED/);
  assert.match(handler, /Reader details are available only to the message sender/);
  assert.match(handler, /COUNT\(\*\) OVER\(\)::int AS total_count/);
  assert.match(handler, /next_offset/);
  assert.match(handler, /ac_read_cursor/);
  assert.match(handler, /ac_thread_read_cursor/);
  assert.match(handler, /cursor_message\.created_at/);
  assert.match(handler, /cursor_reply\.created_at/);

  assert.match(server, /createMessageReadersHttpHandler/);
  assert.match(server, /messageReadersHttpHandler\s*\(\s*req\s*,\s*res\s*\)/s);
});

test('V16-R reader response exposes display name and read time only', () => {
  const handler = read('services/api/src/messaging/messageReadersHttpHandler.js');
  const modal = read('apps/mobile/src/screens/MessageReadersModal.jsx');

  assert.match(handler, /display_name:\s*clean\(row\?\.display_name\)/);
  assert.match(handler, /read_at:\s*row\?\.read_at/);
  assert.doesNotMatch(handler, /publicReader[\s\S]{0,300}primary_email/);
  assert.doesNotMatch(handler, /publicReader[\s\S]{0,300}phone/);

  assert.match(modal, /reader\.display_name/);
  assert.match(modal, /formatReadTime\(reader\.read_at\)/);
  assert.doesNotMatch(modal, /reader\.workspace_member_id/);
  assert.doesNotMatch(modal, /reader\.primary_email/);
});

test('V20.1 keeps sender message info available before and after read receipts', () => {
  const screen = read('apps/mobile/src/screens/ConversationScreen.jsx');
  const thread = read('apps/mobile/src/screens/ThreadModal.jsx');
  const modal = read('apps/mobile/src/screens/MessageReadersModal.jsx');

  for (const source of [screen, thread]) {
    assert.match(source, /MessageReadersModal/);
    assert.match(source, /Show message info/);
    assert.match(source, /ⓘ Info/);
    assert.doesNotMatch(source, /Number\(message\.read_by_count \|\| 0\) > 0/);
  }

  assert.match(modal, /Read by/);
  assert.match(modal, /Delivered to/);
});

test('V16-R forwards cursor events and refreshes aggregate/detail receipts in realtime', () => {
  const app = read('apps/mobile/App.jsx');
  const screen = read('apps/mobile/src/screens/ConversationScreen.jsx');
  const thread = read('apps/mobile/src/screens/ThreadModal.jsx');

  assert.match(app, /thread_read_cursor\.updated/);
  assert.match(app, /readCursorEvent/);
  assert.match(app, /setRealtimeEvents/);
  assert.match(app, /ownReadCursor/);
  assert.match(app, /payload\.workspace_member_id ===[\s\S]*sessionRef\.current\?\.membership\?\.workspace_member_id/);

  assert.match(screen, /readCursorEvents/);
  assert.match(screen, /setMessageReadersRefreshEpoch/);
  assert.match(screen, /loadLatest\(\{ reconcile: true \}\)/);

  assert.match(thread, /thread_read_cursor\.updated/);
  assert.match(thread, /scheduleThreadReadReceiptRefresh/);
  assert.match(thread, /setMessageReadersRefreshEpoch/);
});
