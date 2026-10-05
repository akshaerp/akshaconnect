'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('V16-K keeps an explicit unread boundary on mobile and web', () => {
  assert.match(read('apps/mobile/src/screens/ConversationScreen.jsx'), /New messages/);
  assert.match(read('apps/web/src/App.jsx'), /Unread messages/);
});

test('V16-K keeps read state accessible through sender Message Info', () => {
  const mobile = read('apps/mobile/src/screens/ConversationScreen.jsx');
  const web = read('apps/web/src/App.jsx');

  assert.match(mobile, /MessageReadersModal/);
  assert.match(mobile, /Info/);
  assert.match(web, /MessageInfoDialog/);
  assert.match(web, /Info/);
});

test('V16-K strengthens thread unread styling', () => {
  const mobile = read('apps/mobile/src/screens/ConversationScreen.jsx');
  assert.match(mobile, /threadSummaryUnread/);
  assert.match(mobile, /thread_unread_count/);
});
