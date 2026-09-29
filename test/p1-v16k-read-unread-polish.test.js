'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('V16-K uses explicit unread boundary wording on mobile and web', () => {
  assert.match(read('apps/mobile/src/screens/ConversationScreen.jsx'), /Unread messages/);
  assert.match(read('apps/web/src/App.jsx'), /Unread messages/);
});

test('V16-K makes read receipts clearer', () => {
  assert.match(read('apps/mobile/src/screens/ConversationScreen.jsx'), /✓✓ Read by/);
  assert.match(read('apps/web/src/App.jsx'), /✓✓ Read by/);
});

test('V16-K strengthens thread unread styling', () => {
  const mobile = read('apps/mobile/src/screens/ConversationScreen.jsx');
  assert.match(mobile, /threadSummaryUnread/);
  assert.match(mobile, /thread_unread_count/);
});
