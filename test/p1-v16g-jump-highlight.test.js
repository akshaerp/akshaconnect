'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('V16-G mobile loads older pages, scrolls and highlights quoted target', () => {
  const mobile = read('apps/mobile/src/screens/ConversationScreen.jsx');
  assert.match(mobile, /async function jumpToMessage\(messageId\)/);
  assert.match(mobile, /while \(!working\.some[\s\S]*workingPage\?\.has_more/);
  assert.match(mobile, /messageLayoutYRef/);
  assert.match(mobile, /highlightMessageId/);
  assert.match(mobile, /Jump to quoted message/);
});

test('V16-G web uses message ids for jump and highlight', () => {
  const web = read('apps/web/src/App.jsx');
  assert.match(web, /async function jumpToMessage\(messageId\)/);
  assert.match(web, /data-message-id=\{message\.message_id\}/);
  assert.match(web, /highlighted-message/);
  assert.match(web, /Jump to quoted message/);
});
